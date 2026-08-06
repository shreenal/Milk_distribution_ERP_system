import { Injectable } from '@nestjs/common';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { BillingRow, OrderBillingInput } from '../../../types/order.types.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';

@Injectable()
export class OrdersBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildOrderBillingSection(
    input: OrderBillingInput,
    paperStatus: OrderPaperStatus,
  ) {
    const {
      milkProducts,
      nonMilkProducts,
      milkClients,
      nonMilkClients,
      sheetItems,
    } = input;

    const milkColumns = this.productColumnsBuilder.buildGroupedColumns(
      milkProducts,
      false,
    );

    const nonMilkColumns = this.productColumnsBuilder.buildGroupedColumns(
      nonMilkProducts,
      true,
    );

    const milkProductIds = new Set(milkProducts.map((p) => p.id));

    const nonMilkProductIds = new Set(nonMilkProducts.map((p) => p.id));

    const milkRows: BillingRow[] = [];

    const nonMilkRows: BillingRow[] = [];

    let milkTotalNightBillAmount = 0;

    let milkTotalFinalBillAmount = 0;

    let nonMilkTotalNightBillAmount = 0;

    let nonMilkTotalFinalBillAmount = 0;

    const useOrderedQuantity = paperStatus === OrderPaperStatus.DRAFT;

    for (const client of milkClients) {
      const milkRow: BillingRow = {
        clientId: client.id,
        clientName: client.name,
        billAmount: 0,
      };

      const clientItems = sheetItems.filter(
        (item) => item.client_id === client.id,
      );

      let milkNightBillAmount = 0;
      let milkFinalBillAmount = 0;

      for (const item of clientItems) {
        if (milkProductIds.has(item.product_id)) {
          const key = `product_${item.product_id}`;
          const quantity = useOrderedQuantity
            ? Number(item.ordered_qty ?? 0)
            : Number(item.delivered_qty ?? 0);

          milkRow[key] = quantity;

          milkNightBillAmount += Number(item.night_bill_amount ?? 0);
          milkFinalBillAmount += Number(item.final_bill_amount ?? 0);
        }
      }

      milkRow.billAmount = useOrderedQuantity
        ? Number(milkNightBillAmount.toFixed(2))
        : Number(milkFinalBillAmount.toFixed(2));

      milkRows.push(milkRow);

      milkTotalNightBillAmount += milkNightBillAmount;
      milkTotalFinalBillAmount += milkFinalBillAmount;
    }

    for (const client of nonMilkClients) {
      const nonMilkRow: BillingRow = {
        clientId: client.id,
        clientName: client.name,
        billAmount: 0,
      };

      const clientItems = sheetItems.filter(
        (item) => item.client_id === client.id,
      );

      let nonMilkNightBillAmount = 0;
      let nonMilkFinalBillAmount = 0;

      for (const item of clientItems) {
        if (nonMilkProductIds.has(item.product_id)) {
          const key = `product_${item.product_id}`;

          const quantity = useOrderedQuantity
            ? Number(item.ordered_qty ?? 0)
            : Number(item.delivered_qty ?? 0);

          nonMilkRow[key] = quantity;

          nonMilkNightBillAmount += Number(item.night_bill_amount ?? 0);
          nonMilkFinalBillAmount += Number(item.final_bill_amount ?? 0);
        }
      }

      nonMilkRow.billAmount = useOrderedQuantity
        ? Number(nonMilkNightBillAmount.toFixed(2))
        : Number(nonMilkFinalBillAmount.toFixed(2));

      nonMilkRows.push(nonMilkRow);

      nonMilkTotalNightBillAmount += nonMilkNightBillAmount;
      nonMilkTotalFinalBillAmount += nonMilkFinalBillAmount;
    }

    return {
      milkGrid: {
        columns: milkColumns,
        rows: milkRows,
        totals: {
          totalClients: milkRows.length,
          totalBillAmount: useOrderedQuantity
            ? Number(milkTotalNightBillAmount.toFixed(2))
            : Number(milkTotalFinalBillAmount.toFixed(2)),
        },
      },

      nonMilkGrid: {
        columns: nonMilkColumns,
        rows: nonMilkRows,
        totals: {
          totalClients: nonMilkRows.length,
          totalBillAmount: useOrderedQuantity
            ? Number(nonMilkTotalNightBillAmount.toFixed(2))
            : Number(nonMilkTotalFinalBillAmount.toFixed(2)),
        },
      },
    };
  }
}
