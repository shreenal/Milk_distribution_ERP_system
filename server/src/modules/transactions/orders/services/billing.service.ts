import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { OrdersRepository } from '../orders.repository.js';
import { SaveMorningEntriesDto } from '../dto/save-morning-entries.dto.js';
import { SaveNightEntriesDto } from '../dto/save-night-entries.dto.js';
import { OrderCommercialService } from './order-commercial.service.js';
import { NightBillingService } from './night-billing.service.js';
import { FinalBillingService } from './final-billing.service.js';
import { ERROR_MESSAGES } from '../orders.constants.js';

@Injectable()
export class BillingService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly orderCommercialService: OrderCommercialService,
    private readonly nightBillingService: NightBillingService,
    private readonly finalBillingService: FinalBillingService,
  ) {}

  async saveNightEntry(
    tx: Prisma.TransactionClient,
    sheet: Awaited<ReturnType<OrdersRepository['findSheetById']>>,
    supplyRules: {
      milkDistributorId: number | null;
      nonMilkDistributorId: number | null;
    },
    sheetId: number,
    entry: SaveNightEntriesDto,
  ): Promise<void> {
    const commercialContext = await this.orderCommercialService.resolve(
      sheet!.group_id,
      entry.productId,
      supplyRules,
      tx,
    );

    const sellingRate =
      await this.ordersRepository.getSellingRateForDistributor(
        entry.clientId,
        entry.productId,
        commercialContext.distributorId,
        sheet!.order_paper.sale_date,
        tx,
      );

    if (sellingRate === null || sellingRate === undefined) {
      throw new BadRequestException(
        ERROR_MESSAGES.NO_APPLICABLE_RATE(
          entry.productId,
          sheet!.order_paper.sale_date.toISOString(),
        ),
      );
    }

    const billing = this.nightBillingService.calculate(
      Number(entry.orderedQty),
      Number(sellingRate),
    );

    await this.ordersRepository.upsertSheetEntryTx(tx, {
      order_sheet_id: sheetId,
      client_id: entry.clientId,
      product_id: entry.productId,
      product_link_id: commercialContext.productLinkId,

      ordered_qty: entry.orderedQty,
      night_selling_rate: Number(sellingRate),
      night_bill_amount: billing.nightBillAmount,
    });
  }

  async saveMorningEntry(
    tx: Prisma.TransactionClient,
    sheet: Awaited<ReturnType<OrdersRepository['findSheetById']>>,
    supplyRules: {
      milkDistributorId: number | null;
      nonMilkDistributorId: number | null;
    },
    sheetId: number,
    entry: SaveMorningEntriesDto,
  ): Promise<void> {
    const commercialContext = await this.orderCommercialService.resolve(
      sheet!.group_id,
      entry.productId,
      supplyRules,
      tx,
    );

    const existingItem = await this.ordersRepository.findSheetItem(
      sheetId,
      entry.clientId,
      commercialContext.productLinkId,
      tx,
    );

    if (!existingItem) {
      throw new BadRequestException(
        ERROR_MESSAGES.NO_ORDERED_QUANTITY(entry.clientId, entry.productId),
      );
    }

    const sellingRate =
      await this.ordersRepository.getSellingRateForDistributor(
        entry.clientId,
        entry.productId,
        commercialContext.distributorId,
        sheet!.order_paper.sale_date,
        tx,
      );

    if (sellingRate === null || sellingRate === undefined) {
      throw new BadRequestException(
        `No rate configured for client ${entry.clientId} product ${entry.productId}`,
      );
    }

    const billing = this.finalBillingService.calculate(
      Number(entry.deliveredQty),
      Number(sellingRate),
      Number(existingItem.master_product.gst_percentage ?? 0),
      existingItem.master_product.is_gst_inclusive,
    );

    await tx.order_sheet_items.update({
      where: {
        order_sheet_id_client_id_product_link_id: {
          order_sheet_id: sheetId,
          client_id: entry.clientId,
          product_link_id: commercialContext.productLinkId,
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
