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

    const resolvedLinkByClientProduct = new Map<
      string,
      { distributorId: number; productLinkId: number }
    >();

    const resolutions = new Map<
      string,
      { distributorId: number; productLinkId: number; isNew: boolean }
    >();

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

      const clientProductKey = `${entry.clientId}_${entry.productId}`;

      let link = resolvedLinkByClientProduct.get(clientProductKey);

      if (!link) {
        const commercialContext = await this.orderCommercialService.resolve(
          entry.clientId,
          sheet!.group_id,
          entry.productId,
          tx,
        );

        link = {
          distributorId: commercialContext.distributorId,
          productLinkId: commercialContext.productLinkId,
        };

        resolvedLinkByClientProduct.set(clientProductKey, link);
      }

      resolutions.set(pairKey, { ...link, isNew: true });
    }

    const activeEntries = entries.filter((e) =>
      resolutions.has(`${e.clientId}_${e.productId}`),
    );
    const productIds = [...new Set(activeEntries.map((e) => e.productId))];

    const productMap =
      await this.ordersRepository.getProductsWithPackagingBatch(productIds, tx);

    const ratePairs = activeEntries.map((e) => {
      const r = resolutions.get(`${e.clientId}_${e.productId}`)!;
      return { clientId: e.clientId, productLinkId: r.productLinkId };
    });

    const rateMap = await this.ordersRepository.getSellingRatesBatch(
      ratePairs,
      sheet!.order_paper.sale_date,
      tx,
    );

    for (const entry of activeEntries) {
      const pairKey = `${entry.clientId}_${entry.productId}`;
      const resolution = resolutions.get(pairKey)!;
      const rateKey = `${entry.clientId}_${resolution.productLinkId}`;
      const sellingRate = rateMap.get(rateKey);

      if (sellingRate === null || sellingRate === undefined) {
        throw new BadRequestException(
          ERROR_MESSAGES.NO_APPLICABLE_RATE(
            entry.productId,
            sheet!.order_paper.sale_date.toISOString(),
          ),
        );
      }

      const product = productMap.get(entry.productId);
      if (!product) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT_NOT_FOUND(entry.productId),
        );
      }

      const orderedQty = Number(entry.orderedQty);

      let trayTypeId: number | null | undefined;
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

      const billing = this.nightBillingService.calculate(
        orderedQty,
        Number(sellingRate),
        pricingQuantity,
      );

      const zeroedOrderFields =
        orderedQty === 0
          ? {
              delivered_qty: 0,
              final_selling_rate: Number(sellingRate),
              final_gst_percentage: Number(product.gst_percentage ?? 0),
              final_gst_amount: 0,
              final_taxable_amount: 0,
              final_bill_amount: 0,
            }
          : {};

      await this.ordersRepository.upsertSheetEntry(
        {
          order_sheet_id: sheetId,
          client_id: entry.clientId,
          product_id: entry.productId,
          product_link_id: resolution.productLinkId,
          ordered_qty: entry.orderedQty,
          night_selling_rate: Number(sellingRate),
          night_bill_amount: billing.nightBillAmount,
          tray_type_id: trayTypeId,
          units_per_order_unit: unitsPerOrderUnit,
          pricing_quantity: pricingQuantity,
          pricing_unit: pricingUnit,
          ...zeroedOrderFields,
        },
        tx,
      );
    }
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

      await tx.order_sheet_items.update({
        where: {
          order_sheet_id_client_id_product_link_id: {
            order_sheet_id: sheetId,
            client_id: entry.clientId,
            product_link_id: existingItem.product_link_id,
          },
        },
        data: {
          delivered_qty: Number(entry.deliveredQty),
          final_selling_rate: Number(sellingRate),
          final_gst_percentage: Number(
            existingItem.master_product.gst_percentage ?? 0,
          ),
          final_gst_amount: billing.gstAmount,
          final_taxable_amount: billing.taxableAmount,
          final_bill_amount: billing.finalBillAmount,
        },
      });
    }
  }
}
