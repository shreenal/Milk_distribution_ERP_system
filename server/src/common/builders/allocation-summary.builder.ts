import { Injectable } from '@nestjs/common';
import {
  SupplyCategory,
  DeliverySession,
} from '../../generated/prisma/client.js';

import {
  Product,
  OrderItemWithSupplyContext,
  SummaryRow,
} from '../../types/order-item.types.js';

import { accumulateProductField } from './row-aggregation.util.js';

export type { Product, OrderItemWithSupplyContext, SummaryRow };

export type AllocationSummary = {
  summaryKey: string;
  distributorId: number;
  distributorName: string;
  category: SupplyCategory;
  brandId: number;
  brandName: string;
  products: Product[];
  rows: SummaryRow[];
};

@Injectable()
export class AllocationSummaryBuilder {
  build(
    orderItems: OrderItemWithSupplyContext[],
    session?: DeliverySession,
  ): AllocationSummary[] {
    const summariesMap = new Map<string, AllocationSummary>();

    const filteredOrderItems = session
      ? orderItems.filter((item) => item.deliverySession === session)
      : orderItems;

    for (const item of filteredOrderItems) {
      const product = item.master_product;

      const brandId = product.master_brand.id;
      const brandName = product.master_brand.name;

      const summaryKey = `${item.distributorId}_${item.category}_${brandId}`;

      let summary = summariesMap.get(summaryKey);

      if (!summary) {
        summary = {
          summaryKey,
          distributorId: item.distributorId,
          distributorName: item.distributorName,
          category: item.category,
          brandId,
          brandName,
          rows: [],
          products: [],
        };

        summariesMap.set(summaryKey, summary);
      }

      if (!summary.products.some((p) => p.id === product.id)) {
        summary.products.push(product);
      }

      let row = summary.rows.find((r) => r.groupId === item.groupId);

      if (!row) {
        row = {
          groupId: item.groupId,
          groupName: item.groupName,
        };
        summary.rows.push(row);
      }

      accumulateProductField(row, item.productId, Number(item.orderedQty ?? 0));
    }

    return Array.from(summariesMap.values());
  }
}
