import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  OrderPaperStatus,
  PricingUnit,
  Prisma,
} from '../../../../generated/prisma/client.js';

import { OrdersRepository } from '../orders.repository.js';
import { ExplicitMorningEntry } from '../dto/save-morning-entries.dto.js';
import { ExplicitNightEntry } from '../dto/save-night-entries.dto.js';
import { OrderCommercialService } from './order-commercial.service.js';
import { NightBillingService } from './night-billing.service.js';
import { FinalBillingService } from './final-billing.service.js';
import { ERROR_MESSAGES } from '../orders.constants.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { ProductTrayRule } from '../../../../types/tray.types.js';
import { formatIsoDate } from '../../paper/paper-date.util.js';

export type ExistingItemMap = Awaited<
  ReturnType<OrdersRepository['findSheetItemsByProductBatch']>
>;
type ExistingSheetItem =
  ExistingItemMap extends Map<string, infer T> ? T : never;
type InsertRow = Parameters<
  OrdersRepository['insertMorningCreatedLinesBatch']
>[0][number];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly orderCommercialService: OrderCommercialService,
    private readonly nightBillingService: NightBillingService,
    private readonly finalBillingService: FinalBillingService,
    private readonly trayCalculationService: TrayCalculationService,
  ) {}

  async getTrayRulesOnce(tx: Prisma.TransactionClient) {
    return this.trayCalculationService.getProductTrayRules(tx);
  }

  async saveNightEntriesBatch(
    tx: Prisma.TransactionClient,
    sheet: Awaited<ReturnType<OrdersRepository['findSheetById']>>,
    sheetId: number,
    entries: ExplicitNightEntry[],
    trayRules: ProductTrayRule[],
    existingItemMap: ExistingItemMap,
  ): Promise<void> {
    const resolutions = new Map<
      string,
      {
        distributorId: number;
        productLinkId: number;
        isNew: boolean;
        viaFallback: boolean;
      }
    >();

    const newPairsNeedingResolution: { clientId: number; productId: number }[] =
      [];
    const seenNewPairKeys = new Set<string>();

    for (const entry of entries) {
      const pairKey = `${entry.clientId}_${entry.productId}`;
      const existingItem = existingItemMap.get(pairKey);

      if (existingItem) {
        resolutions.set(pairKey, {
          distributorId: existingItem.product_link.distributor_id,
          productLinkId: existingItem.product_link_id,
          isNew: false,
          viaFallback: false,
        });
        continue;
      }

      // Explicit 0 on a line that does not exist: nothing to create.
      if (Number(entry.orderedQty) === 0) continue;

      if (!seenNewPairKeys.has(pairKey)) {
        seenNewPairKeys.add(pairKey);
        newPairsNeedingResolution.push({
          clientId: entry.clientId,
          productId: entry.productId,
        });
      }
    }

    const batchResolved = await this.orderCommercialService.resolveBatch(
      newPairsNeedingResolution,
      sheet!.group_id,
      tx,
    );

    for (const { clientId, productId } of newPairsNeedingResolution) {
      const pairKey = `${clientId}_${productId}`;
      const resolved = batchResolved.get(pairKey);
      if (!resolved) {
        throw new BadRequestException(
          `Failed to resolve commercial context for client ${clientId} product ${productId}`,
        );
      }
      resolutions.set(pairKey, {
        distributorId: resolved.distributorId,
        productLinkId: resolved.productLinkId,
        isNew: true,
        viaFallback: resolved.resolvedViaFallback,
      });
    }

    const activeEntries = entries.filter((e) =>
      resolutions.has(`${e.clientId}_${e.productId}`),
    );
    const productIds = [...new Set(activeEntries.map((e) => e.productId))];

    const productMap =
      await this.ordersRepository.getProductsWithPackagingBatch(productIds, tx);

    const entriesNeedingRate = activeEntries.filter(
      (e) => Number(e.orderedQty) !== 0,
    );

    const ratePairs = entriesNeedingRate.map((e) => {
      const r = resolutions.get(`${e.clientId}_${e.productId}`)!;
      return { clientId: e.clientId, productLinkId: r.productLinkId };
    });

    const rateMap = await this.ordersRepository.getSellingRatesBatch(
      ratePairs,
      sheet!.order_paper.sale_date,
      tx,
    );

    const ownerByClient = await this.ordersRepository.getClientOwnersBatch(
      [...new Set(newPairsNeedingResolution.map((p) => p.clientId))],
      tx,
    );

    const rowsToUpsert: Parameters<
      OrdersRepository['upsertSheetEntriesBatch']
    >[0] = [];

    for (const entry of activeEntries) {
      const pairKey = `${entry.clientId}_${entry.productId}`;
      const resolution = resolutions.get(pairKey)!;
      const rateKey = `${entry.clientId}_${resolution.productLinkId}`;

      const product = productMap.get(entry.productId);
      if (!product) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT_NOT_FOUND(entry.productId),
        );
      }

      const orderedQty = Number(entry.orderedQty);

      let trayTypeId: number | null;
      let unitsPerOrderUnit: number;
      let pricingQuantity: number;
      let pricingUnit: PricingUnit;

      if (resolution.isNew) {
        trayTypeId =
          this.trayCalculationService.resolveTrayRule(product, trayRules)
            ?.tray_type_id ?? null;

        const orderUnit = product.product_order_unit;
        if (
          !orderUnit ||
          orderUnit.units_per_order_unit <= 0 ||
          Number(orderUnit.pricing_quantity) <= 0
        ) {
          throw new BadRequestException(
            `Order unit configuration missing for product ${entry.productId}`,
          );
        }
        unitsPerOrderUnit = orderUnit.units_per_order_unit;
        pricingQuantity = Number(orderUnit.pricing_quantity);
        pricingUnit = orderUnit.pricing_unit;
      } else {
        const existingItem = existingItemMap.get(pairKey)!;
        if (
          existingItem.units_per_order_unit <= 0 ||
          Number(existingItem.pricing_quantity) <= 0 ||
          !existingItem.pricing_unit
        ) {
          throw new BadRequestException(
            `Order unit configuration missing for product ${entry.productId}`,
          );
        }
        unitsPerOrderUnit = existingItem.units_per_order_unit;
        pricingQuantity = Number(existingItem.pricing_quantity);
        pricingUnit = existingItem.pricing_unit;
        trayTypeId = existingItem.tray_type_id;
      }

      let sellingRate: number | null = null;
      let nightBillAmount: number;

      if (orderedQty === 0) {
        // OD-6.10: a cancellation keeps the line's stored night rate; it is never
        // re-resolved. Explicit 0 only reaches here for existing lines (a zero for a
        // non-existent line is skipped above). null => final rate 0, night rate untouched.
        const storedNightRate =
          existingItemMap.get(pairKey)?.night_selling_rate;
        sellingRate =
          storedNightRate !== null && storedNightRate !== undefined
            ? Number(storedNightRate)
            : null;
        nightBillAmount = 0;
      } else {
        const resolvedRate = rateMap.get(rateKey);
        if (resolvedRate === null || resolvedRate === undefined) {
          throw new BadRequestException(
            ERROR_MESSAGES.NO_APPLICABLE_RATE(
              entry.productId,
              formatIsoDate(sheet!.order_paper.sale_date),
            ),
          );
        }
        sellingRate = Number(resolvedRate);

        // Decision 6: GST is part of the night bill, using the same rule as final billing.
        nightBillAmount = this.nightBillingService.calculate(
          orderedQty,
          sellingRate,
          Number(product.gst_percentage ?? 0),
          product.is_gst_inclusive,
          pricingQuantity,
        ).nightBillAmount;
      }

      const isZeroed = orderedQty === 0;

      rowsToUpsert.push({
        order_sheet_id: sheetId,
        client_id: entry.clientId,
        product_id: entry.productId,
        product_link_id: resolution.productLinkId,
        ordered_qty: orderedQty,
        night_selling_rate: sellingRate,
        night_bill_amount: nightBillAmount,
        tray_type_id: trayTypeId,
        units_per_order_unit: unitsPerOrderUnit,
        pricing_quantity: pricingQuantity,
        pricing_unit: pricingUnit,
        delivered_qty: isZeroed ? 0 : null,
        final_selling_rate: isZeroed ? (sellingRate ?? 0) : null,
        final_gst_percentage: isZeroed
          ? Number(product.gst_percentage ?? 0)
          : null,
        final_gst_amount: isZeroed ? 0 : null,
        final_taxable_amount: isZeroed ? 0 : null,
        final_bill_amount: isZeroed ? 0 : null,
        owner_distributor_id: resolution.isNew
          ? (ownerByClient.get(entry.clientId) ?? null)
          : null,
        final_gst_inclusive: isZeroed ? product.is_gst_inclusive : null,
        resolved_via_fallback: resolution.isNew && resolution.viaFallback,
      });
    }

    await this.ordersRepository.upsertSheetEntriesBatch(rowsToUpsert, tx);
  }

  async saveMorningEntriesBatch(
    tx: Prisma.TransactionClient,
    sheet: Awaited<ReturnType<OrdersRepository['findSheetById']>>,
    sheetId: number,
    entries: ExplicitMorningEntry[],
    existingItemMap: ExistingItemMap,
  ): Promise<void> {
    const existingEntries: {
      entry: ExplicitMorningEntry;
      existingItem: ExistingSheetItem;
    }[] = [];
    const newLineEntries: ExplicitMorningEntry[] = [];

    for (const entry of entries) {
      const existingItem = existingItemMap.get(
        `${entry.clientId}_${entry.productId}`,
      );
      if (existingItem) {
        existingEntries.push({ entry, existingItem });
      } else if (Number(entry.deliveredQty) > 0) {
        newLineEntries.push(entry);
      }
    }

    if (existingEntries.length === 0 && newLineEntries.length === 0) return;

    // OD-7.5: warning only, logged when the delivered value changes.
    const over = existingEntries.filter(({ entry, existingItem }) => {
      const ordered = Number(existingItem.ordered_qty ?? 0);
      const delivered = Number(entry.deliveredQty);
      return (
        ordered > 0 &&
        delivered > ordered * 1.5 &&
        Number(existingItem.delivered_qty ?? NaN) !== delivered
      );
    });
    if (over.length > 0) {
      this.logger.warn(
        `Sheet ${sheetId}: over-delivery (>150% of ordered) on ${over.length} line(s): ` +
          over
            .map(
              ({ entry }) =>
                `client ${entry.clientId}/product ${entry.productId}`,
            )
            .join(', '),
      );
    }

    const isReopened = sheet!.order_paper.status === OrderPaperStatus.REOPENED;
    const hasFrozenCommercials = (item: ExistingSheetItem) =>
      isReopened &&
      item.final_selling_rate !== null &&
      item.final_gst_percentage !== null &&
      Number(item.delivered_qty ?? 0) > 0;

    // OD-7.12: ordered 0 + stored night rate = cancelled via OD-6.10 (morning-created lines never have a night rate).
    const isCancelledLine = (item: ExistingSheetItem) =>
      Number(item.ordered_qty ?? 0) === 0 && item.night_selling_rate !== null;
    const skipsLiveRate = (
      entry: ExplicitMorningEntry,
      item: ExistingSheetItem,
    ) => isCancelledLine(item) && Number(entry.deliveredQty) === 0;

    const created = await this.prepareMorningCreatedLines(
      newLineEntries,
      sheet,
      tx,
    );

    const ratePairs = [
      ...existingEntries
        .filter(
          ({ entry, existingItem }) =>
            !hasFrozenCommercials(existingItem) &&
            !skipsLiveRate(entry, existingItem),
        )
        .map(({ entry, existingItem }) => ({
          clientId: entry.clientId,
          productLinkId: existingItem.product_link_id,
        })),
      ...created.map((c) => ({
        clientId: c.entry.clientId,
        productLinkId: c.productLinkId,
      })),
    ];

    const rateMap = await this.ordersRepository.getSellingRatesBatch(
      ratePairs,
      sheet!.order_paper.sale_date,
      tx,
    );

    const rowsToUpdate: Parameters<
      OrdersRepository['updateDeliveredEntriesBatch']
    >[0] = [];

    for (const { entry, existingItem } of existingEntries) {
      let sellingRate: number;
      let gstPercentage: number;
      let gstInclusive: boolean;

      if (hasFrozenCommercials(existingItem)) {
        // Decision 18: keep the original final pricing/GST on a reopened, already-billed line.
        sellingRate = Number(existingItem.final_selling_rate);
        gstPercentage = Number(existingItem.final_gst_percentage);
        gstInclusive =
          existingItem.final_gst_inclusive ??
          existingItem.master_product.is_gst_inclusive;
      } else if (skipsLiveRate(entry, existingItem)) {
        sellingRate = Number(
          existingItem.final_selling_rate ??
            existingItem.night_selling_rate ??
            0,
        );
        gstPercentage = Number(
          existingItem.final_gst_percentage ??
            existingItem.master_product.gst_percentage ??
            0,
        );
        gstInclusive =
          existingItem.final_gst_inclusive ??
          existingItem.master_product.is_gst_inclusive;
      } else {
        const liveRate = rateMap.get(
          `${entry.clientId}_${existingItem.product_link_id}`,
        );
        if (liveRate === null || liveRate === undefined) {
          throw new BadRequestException(
            `No rate configured for client ${entry.clientId} product ${entry.productId}`,
          );
        }
        sellingRate = Number(liveRate);
        gstPercentage = Number(existingItem.master_product.gst_percentage ?? 0);
        gstInclusive = existingItem.master_product.is_gst_inclusive;
      }

      const pricingQuantity = existingItem.pricing_quantity;
      if (
        pricingQuantity === null ||
        pricingQuantity === undefined ||
        Number(pricingQuantity) <= 0
      ) {
        throw new BadRequestException(
          `Order unit configuration missing for product ${entry.productId}`,
        );
      }

      const billing = this.finalBillingService.calculate(
        Number(entry.deliveredQty),
        sellingRate,
        gstPercentage,
        gstInclusive,
        Number(pricingQuantity),
      );

      rowsToUpdate.push({
        order_sheet_id: sheetId,
        client_id: entry.clientId,
        product_link_id: existingItem.product_link_id,
        delivered_qty: Number(entry.deliveredQty),
        final_selling_rate: sellingRate,
        final_gst_percentage: gstPercentage,
        final_gst_inclusive: gstInclusive,
        final_gst_amount: billing.gstAmount,
        final_taxable_amount: billing.taxableAmount,
        final_bill_amount: billing.finalBillAmount,
      });
    }

    const rowsToInsert: InsertRow[] = [];

    for (const c of created) {
      const liveRate = rateMap.get(`${c.entry.clientId}_${c.productLinkId}`);
      if (liveRate === null || liveRate === undefined) {
        throw new BadRequestException(
          `No rate configured for client ${c.entry.clientId} product ${c.entry.productId}`,
        );
      }
      const sellingRate = Number(liveRate);
      const gstPercentage = Number(c.product.gst_percentage ?? 0);
      const gstInclusive = c.product.is_gst_inclusive;

      const billing = this.finalBillingService.calculate(
        Number(c.entry.deliveredQty),
        sellingRate,
        gstPercentage,
        gstInclusive,
        c.pricingQuantity,
      );

      rowsToInsert.push({
        order_sheet_id: sheetId,
        client_id: c.entry.clientId,
        product_id: c.entry.productId,
        product_link_id: c.productLinkId,
        // No customer night order exists for a morning-created line.
        ordered_qty: 0,
        night_selling_rate: null,
        night_bill_amount: 0,
        tray_type_id: c.trayTypeId,
        units_per_order_unit: c.unitsPerOrderUnit,
        pricing_quantity: c.pricingQuantity,
        pricing_unit: c.pricingUnit,
        delivered_qty: Number(c.entry.deliveredQty),
        final_selling_rate: sellingRate,
        final_gst_percentage: gstPercentage,
        final_gst_amount: billing.gstAmount,
        final_taxable_amount: billing.taxableAmount,
        final_bill_amount: billing.finalBillAmount,
        owner_distributor_id: c.ownerDistributorId,
        final_gst_inclusive: gstInclusive,
        resolved_via_fallback: c.viaFallback,
      });
    }

    await this.ordersRepository.updateDeliveredEntriesBatch(rowsToUpdate, tx);
    await this.ordersRepository.insertMorningCreatedLinesBatch(
      rowsToInsert,
      tx,
    );
  }

  /** Same frozen-line resolution as a night-created line: supplier, tray type, order unit, owner. */
  private async prepareMorningCreatedLines(
    entries: ExplicitMorningEntry[],
    sheet: Awaited<ReturnType<OrdersRepository['findSheetById']>>,
    tx: Prisma.TransactionClient,
  ) {
    if (entries.length === 0) return [];

    const resolved = await this.orderCommercialService.resolveBatch(
      entries.map((e) => ({ clientId: e.clientId, productId: e.productId })),
      sheet!.group_id,
      tx,
    );
    const trayRules = await this.getTrayRulesOnce(tx);
    const productMap =
      await this.ordersRepository.getProductsWithPackagingBatch(
        [...new Set(entries.map((e) => e.productId))],
        tx,
      );
    const ownerByClient = await this.ordersRepository.getClientOwnersBatch(
      [...new Set(entries.map((e) => e.clientId))],
      tx,
    );

    return entries.map((entry) => {
      const resolution = resolved.get(`${entry.clientId}_${entry.productId}`);
      if (!resolution) {
        throw new BadRequestException(
          `Failed to resolve commercial context for client ${entry.clientId} product ${entry.productId}`,
        );
      }
      const product = productMap.get(entry.productId);
      if (!product) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT_NOT_FOUND(entry.productId),
        );
      }
      const orderUnit = product.product_order_unit;
      if (
        !orderUnit ||
        orderUnit.units_per_order_unit <= 0 ||
        Number(orderUnit.pricing_quantity) <= 0
      ) {
        throw new BadRequestException(
          `Order unit configuration missing for product ${entry.productId}`,
        );
      }
      return {
        entry,
        product,
        productLinkId: resolution.productLinkId,
        viaFallback: resolution.resolvedViaFallback,
        trayTypeId:
          this.trayCalculationService.resolveTrayRule(product, trayRules)
            ?.tray_type_id ?? null,
        unitsPerOrderUnit: orderUnit.units_per_order_unit,
        pricingQuantity: Number(orderUnit.pricing_quantity),
        pricingUnit: orderUnit.pricing_unit as PricingUnit,
        ownerDistributorId: ownerByClient.get(entry.clientId) ?? null,
      };
    });
  }
}
