import { Injectable } from '@nestjs/common';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { BillingRow, OrderBillingInput } from '../../../types/order.types.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import {
  Decimal,
  toDecimal,
  toMoney,
} from '../../../common/utils/money.util.js';

@Injectable()
export class OrdersBuilder {
  constructor(
    private readonly productColumnsBuilder: ProductColumnsBuilder,
    private readonly workflowState: WorkflowStateService,
  ) {}

  buildOrderBillingSection(
    input: OrderBillingInput,
    paperStatus: OrderPaperStatus,
    morningEntrySaved: boolean,
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

    const itemsByClientId = new Map<number, typeof sheetItems>();

    for (const item of sheetItems) {
      const list = itemsByClientId.get(item.client_id);

      if (list) {
        list.push(item);
      } else {
        itemsByClientId.set(item.client_id, [item]);
      }
    }

    const milkRows: BillingRow[] = [];
    const nonMilkRows: BillingRow[] = [];

    let milkTotalNightBillAmount = new Decimal(0);
    let milkTotalFinalBillAmount = new Decimal(0);
    let nonMilkTotalNightBillAmount = new Decimal(0);
    let nonMilkTotalFinalBillAmount = new Decimal(0);

    const useOrderedQuantity = this.workflowState.resolveUseOrderedQuantity(
      paperStatus,
      morningEntrySaved,
    );

    for (const client of milkClients) {
      const milkRow: BillingRow = {
        clientId: client.id,
        clientName: client.name,
        billAmount: 0,
      };

      const clientItems = itemsByClientId.get(client.id) ?? [];

      let milkNightBillAmount = new Decimal(0);
      let milkFinalBillAmount = new Decimal(0);

      for (const item of clientItems) {
        if (milkProductIds.has(item.product_id)) {
          const key = `product_${item.product_id}`;

          const quantity = useOrderedQuantity
            ? Number(item.ordered_qty ?? 0)
            : Number(item.delivered_qty ?? 0);

          milkRow[key] = quantity;

          milkNightBillAmount = milkNightBillAmount.plus(
            toDecimal(item.night_bill_amount),
          );
          milkFinalBillAmount = milkFinalBillAmount.plus(
            toDecimal(item.final_bill_amount),
          );
        }
      }

      milkRow.billAmount = useOrderedQuantity
        ? toMoney(milkNightBillAmount)
        : toMoney(milkFinalBillAmount);

      milkRows.push(milkRow);

      milkTotalNightBillAmount =
        milkTotalNightBillAmount.plus(milkNightBillAmount);
      milkTotalFinalBillAmount =
        milkTotalFinalBillAmount.plus(milkFinalBillAmount);
    }

    for (const client of nonMilkClients) {
      const nonMilkRow: BillingRow = {
        clientId: client.id,
        clientName: client.name,
        billAmount: 0,
      };

      const clientItems = itemsByClientId.get(client.id) ?? [];

      let nonMilkNightBillAmount = new Decimal(0);
      let nonMilkFinalBillAmount = new Decimal(0);

      for (const item of clientItems) {
        if (nonMilkProductIds.has(item.product_id)) {
          const key = `product_${item.product_id}`;

          const quantity = useOrderedQuantity
            ? Number(item.ordered_qty ?? 0)
            : Number(item.delivered_qty ?? 0);

          nonMilkRow[key] = quantity;

          nonMilkNightBillAmount = nonMilkNightBillAmount.plus(
            toDecimal(item.night_bill_amount),
          );
          nonMilkFinalBillAmount = nonMilkFinalBillAmount.plus(
            toDecimal(item.final_bill_amount),
          );
        }
      }

      nonMilkRow.billAmount = useOrderedQuantity
        ? toMoney(nonMilkNightBillAmount)
        : toMoney(nonMilkFinalBillAmount);

      nonMilkRows.push(nonMilkRow);

      nonMilkTotalNightBillAmount = nonMilkTotalNightBillAmount.plus(
        nonMilkNightBillAmount,
      );
      nonMilkTotalFinalBillAmount = nonMilkTotalFinalBillAmount.plus(
        nonMilkFinalBillAmount,
      );
    }

    return {
      milkGrid: {
        columns: milkColumns,
        rows: milkRows,
        totals: {
          totalClients: milkRows.length,
          totalBillAmount: useOrderedQuantity
            ? toMoney(milkTotalNightBillAmount)
            : toMoney(milkTotalFinalBillAmount),
        },
      },

      nonMilkGrid: {
        columns: nonMilkColumns,
        rows: nonMilkRows,
        totals: {
          totalClients: nonMilkRows.length,
          totalBillAmount: useOrderedQuantity
            ? toMoney(nonMilkTotalNightBillAmount)
            : toMoney(nonMilkTotalFinalBillAmount),
        },
      },
    };
  }
}
