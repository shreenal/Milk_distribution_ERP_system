import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SupplyCategory,
  DeliverySession,
} from '../../generated/prisma/client.js';

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type OrderItemWithSupplyContext = {
  groupId: number;
  groupName: string;
  productId: number;
  orderedQty: number;
  distributorId: number;
  deliverySession: DeliverySession;
  category: SupplyCategory;
  master_product: Product;
};

export type SummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};

export type AllocationSummary = {
  summaryKey: string;
  distributorId: number;
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

      const field = `product_${item.productId}`;
      const currentValue = typeof row[field] === 'number' ? row[field] : 0;
      row[field] = currentValue + Number(item.orderedQty ?? 0);
    }

    const summaries: AllocationSummary[] = [];

    for (const summary of summariesMap.values()) {
      summaries.push({
        summaryKey: summary.summaryKey,
        distributorId: summary.distributorId,
        category: summary.category,
        brandId: summary.brandId,
        brandName: summary.brandName,
        products: summary.products,
        rows: summary.rows,
      });
    }

    return summaries;
  }
}
