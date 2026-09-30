// FULL FILE REPLACEMENT for orders/services/billing.service.ts
//
// FIX H1: saveNightEntriesBatch previously called
// orderCommercialService.resolve(...) awaited inside a `for` loop, once
// per new (client, product) pair — each call doing several sequential DB
// round-trips. It now collects every pair needing a new resolution first,
// then resolves them all in a single call to
// orderCommercialService.resolveBatch(...).
//
// FIX H2: previously every existing (non-new) item — including one being
// corrected down to orderedQty 0 — still required a resolvable current
// selling rate, throwing NO_APPLICABLE_RATE otherwise. A zero-quantity
// line's bill amount is always 0 regardless of rate, so that requirement
// is now conditional on orderedQty !== 0 (matching how new zero-qty pairs
// already skipped resolution entirely).
//
// saveMorningEntriesBatch and getTrayRulesOnce are unchanged from the
// original file.
import { BadRequestException, Injectable } from '@nestjs/common';
import { PricingUnit, Prisma } from '../../../../generated/prisma/client.js';

import { OrdersRepository } from '../orders.repository.js';
import { SaveMorningEntriesDto } from '../dto/save-morning-entries.dto.js';
import { SaveNightEntriesDto } from '../dto/save-night-entries.dto.js';
import { OrderCommercialService } from './order-commercial.service.js';
import { NightBillingService } from './night-billing.service.js';
import { FinalBillingService } from './final-billing.service.js';
import { ERROR_MESSAGES } from '../orders.constants.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { ProductTrayRule } from '../../../../types/tray.types.js';

type ExistingSheetItem =
  Awaited<
    ReturnType<OrdersRepository['findSheetItemsByProductBatch']>
  > extends Map<string, infer T>
    ? T
    : never;

@Injectable()
export class BillingService {
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
    entries: SaveNightEntriesDto[],
    trayRules: ProductTrayRule[],
  ): Promise<void> {
    const existingItemMap =
      await this.ordersRepository.findSheetItemsByProductBatch(
        sheetId,
        entries.map((e) => ({ clientId: e.clientId, productId: e.productId })),
        tx,
      );

    const resolutions = new Map<
      string,
      { distributorId: number; productLinkId: number; isNew: boolean }
    >();

    // FIX H1: collect pairs needing a brand-new commercial resolution and
    // resolve them all in one batched call after this loop, instead of
    // one sequential resolution chain per pair inside it.
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
        });
        continue;
      }

      if (Number(entry.orderedQty) === 0) {
        continue;
      }

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

      // Defensive only: resolveBatch throws per-pair on any resolution
      // failure, so every requested pair should be present on success.
      if (!resolved) {
        throw new BadRequestException(
          `Failed to resolve commercial context for client ${clientId} product ${productId}`,
        );
      }

      resolutions.set(pairKey, {
        distributorId: resolved.distributorId,
        productLinkId: resolved.productLinkId,
        isNew: true,
      });
    }

    const activeEntries = entries.filter((e) =>
      resolutions.has(`${e.clientId}_${e.productId}`),
    );
    const productIds = [...new Set(activeEntries.map((e) => e.productId))];

    const productMap =
      await this.ordersRepository.getProductsWithPackagingBatch(productIds, tx);

    // FIX H2: only entries with a nonzero quantity need a resolvable
    // current rate — kept as a single batched lookup either way.
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
        const maybeRate = rateMap.get(rateKey);
        sellingRate =
          maybeRate !== null && maybeRate !== undefined
            ? Number(maybeRate)
            : null;
        nightBillAmount = 0;
      } else {
        const resolvedRate = rateMap.get(rateKey);

        if (resolvedRate === null || resolvedRate === undefined) {
          throw new BadRequestException(
            ERROR_MESSAGES.NO_APPLICABLE_RATE(
              entry.productId,
              sheet!.order_paper.sale_date.toISOString(),
            ),
          );
        }

        sellingRate = Number(resolvedRate);
        const billing = this.nightBillingService.calculate(
          orderedQty,
          sellingRate,
          pricingQuantity,
        );
        nightBillAmount = billing.nightBillAmount;
      }

      const isZeroed = orderedQty === 0;

      rowsToUpsert.push({
        order_sheet_id: sheetId,
        client_id: entry.clientId,
        product_id: entry.productId,
        product_link_id: resolution.productLinkId,
        ordered_qty: entry.orderedQty,
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
      });
    }

    await this.ordersRepository.upsertSheetEntriesBatch(rowsToUpsert, tx);
  }

  async saveMorningEntriesBatch(
    tx: Prisma.TransactionClient,
    sheet: Awaited<ReturnType<OrdersRepository['findSheetById']>>,
    sheetId: number,
    entries: SaveMorningEntriesDto[],
  ): Promise<void> {
    const pairs = entries.map((e) => ({
      clientId: e.clientId,
      productId: e.productId,
    }));
    const existingItemMap =
      await this.ordersRepository.findSheetItemsByProductBatch(
        sheetId,
        pairs,
        tx,
      );

    const activeEntries: {
      entry: SaveMorningEntriesDto;
      existingItem: ExistingSheetItem;
    }[] = [];

    for (const entry of entries) {
      const key = `${entry.clientId}_${entry.productId}`;
      const existingItem = existingItemMap.get(key);
      const deliveredQty = Number(entry.deliveredQty);

      if (!existingItem) {
        if (deliveredQty === 0) continue;
        throw new BadRequestException(
          ERROR_MESSAGES.NO_ORDERED_QUANTITY(entry.clientId, entry.productId),
        );
      }
      activeEntries.push({ entry, existingItem });
    }

    if (activeEntries.length === 0) return;

    const ratePairs = activeEntries.map(({ entry, existingItem }) => ({
      clientId: entry.clientId,
      productLinkId: existingItem.product_link_id,
    }));

    const rateMap = await this.ordersRepository.getSellingRatesBatch(
      ratePairs,
      sheet!.order_paper.sale_date,
      tx,
    );

    const rowsToUpdate: Parameters<
      OrdersRepository['updateDeliveredEntriesBatch']
    >[0] = [];

    for (const { entry, existingItem } of activeEntries) {
      const rateKey = `${entry.clientId}_${existingItem.product_link_id}`;
      const sellingRate = rateMap.get(rateKey);

      if (sellingRate === null || sellingRate === undefined) {
        throw new BadRequestException(
          `No rate configured for client ${entry.clientId} product ${entry.productId}`,
        );
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
        Number(sellingRate),
        Number(existingItem.master_product.gst_percentage ?? 0),
        existingItem.master_product.is_gst_inclusive,
        Number(pricingQuantity),
      );

      rowsToUpdate.push({
        order_sheet_id: sheetId,
        client_id: entry.clientId,
        product_link_id: existingItem.product_link_id,
        delivered_qty: Number(entry.deliveredQty),
        final_selling_rate: Number(sellingRate),
        final_gst_percentage: Number(
          existingItem.master_product.gst_percentage ?? 0,
        ),
        final_gst_amount: billing.gstAmount,
        final_taxable_amount: billing.taxableAmount,
        final_bill_amount: billing.finalBillAmount,
      });
    }

    await this.ordersRepository.updateDeliveredEntriesBatch(rowsToUpdate, tx);
  }
}
