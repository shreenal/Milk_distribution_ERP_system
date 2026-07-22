import { Injectable } from '@nestjs/common';
import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';
import { BillingRow, OrderBillingInput } from '../../types/order.types.js';

@Injectable()
export class OrdersBillingBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildOrderBillingSection(input: OrderBillingInput) {
    const {
      milkProducts,
      nonMilkProducts,
      milkClients,
      nonMilkClients,
      sheetItems,
    } = input;

    const milkColumns = this.productColumnsBuilder.buildGroupedColumns(
      milkProducts,
      'ordered',
      false,
    );

    const nonMilkColumns = this.productColumnsBuilder.buildGroupedColumns(
      nonMilkProducts,
      'ordered',
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

    for (const client of milkClients) {
      const milkRow: BillingRow = {
        clientId: client.id,
        clientName: client.name,
      };

      const clientItems = sheetItems.filter(
        (item) => item.client_id === client.id,
      );

      let milkNightBillAmount = 0;
      let milkFinalBillAmount = 0;

      for (const item of clientItems) {
        const orderedQty = Number(item.ordered_qty ?? 0);
        const deliveredQty =
          item.delivered_qty !== null ? Number(item.delivered_qty) : null;

        if (milkProductIds.has(item.product_id)) {
          const orderedKey = `product_${item.product_id}_ordered`;
          const deliveredKey = `product_${item.product_id}_delivered`;

          milkRow[orderedKey] = Number(milkRow[orderedKey] ?? 0) + orderedQty;
          milkRow[deliveredKey] =
            deliveredQty === null
              ? (milkRow[deliveredKey] ?? null)
              : Number(milkRow[deliveredKey] ?? 0) + deliveredQty;

          milkNightBillAmount += Number(item.night_bill_amount ?? 0);
          milkFinalBillAmount += Number(item.final_bill_amount ?? 0);
        }
      }

      milkRow.nightBillAmount = Number(milkNightBillAmount.toFixed(2));
      milkRow.finalBillAmount = Number(milkFinalBillAmount.toFixed(2));

      milkRows.push(milkRow);

      milkTotalNightBillAmount += milkNightBillAmount;
      milkTotalFinalBillAmount += milkFinalBillAmount;
    }

    for (const client of nonMilkClients) {
      const nonMilkRow: BillingRow = {
        clientId: client.id,
        clientName: client.name,
      };

      const clientItems = sheetItems.filter(
        (item) => item.client_id === client.id,
      );

      let nonMilkNightBillAmount = 0;
      let nonMilkFinalBillAmount = 0;

      for (const item of clientItems) {
        const orderedQty = Number(item.ordered_qty ?? 0);
        const deliveredQty =
          item.delivered_qty !== null ? Number(item.delivered_qty) : null;

        if (nonMilkProductIds.has(item.product_id)) {
          const orderedKey = `product_${item.product_id}_ordered`;
          const deliveredKey = `product_${item.product_id}_delivered`;

          nonMilkRow[orderedKey] =
            Number(nonMilkRow[orderedKey] ?? 0) + orderedQty;
          nonMilkRow[deliveredKey] =
            deliveredQty === null
              ? (nonMilkRow[deliveredKey] ?? null)
              : Number(nonMilkRow[deliveredKey] ?? 0) + deliveredQty;

          nonMilkNightBillAmount += Number(item.night_bill_amount ?? 0);
          nonMilkFinalBillAmount += Number(item.final_bill_amount ?? 0);
        }
      }

      nonMilkRow.nightBillAmount = Number(nonMilkNightBillAmount.toFixed(2));
      nonMilkRow.finalBillAmount = Number(nonMilkFinalBillAmount.toFixed(2));

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
          totalNightBillAmount: Number(milkTotalNightBillAmount.toFixed(2)),
          totalFinalBillAmount: Number(milkTotalFinalBillAmount.toFixed(2)),
        },
      },

      nonMilkGrid: {
        columns: nonMilkColumns,
        rows: nonMilkRows,
        totals: {
          totalClients: nonMilkRows.length,
          totalNightBillAmount: Number(nonMilkTotalNightBillAmount.toFixed(2)),
          totalFinalBillAmount: Number(nonMilkTotalFinalBillAmount.toFixed(2)),
        },
      },
    };
  }
}
