import { Injectable } from '@nestjs/common';
import { DeliverySession } from '../../generated/prisma/client.js';
import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from './product-columns.builder.js';
import {
  OrderItemWithSupplyContext,
  Product,
} from './allocation-summary.builder.js';
// FIX F7/F8 (consistency review): shared with allocation-summary.builder.ts
// and vehicle-allocation.builder.ts instead of re-implementing the same
// accumulation/summing logic locally.
import {
  accumulateProductField,
  sumNumericFields,
} from './row-aggregation.util.js';

export type GroupSummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};

export type GroupSummary = {
  brandId: number;
  brandName: string;
  products: Product[];
  columns: ProductColumnNode[];
  rows: GroupSummaryRow[];
  totals: Record<string, number>;
};

@Injectable()
export class GroupSummaryBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  build(
    orderItems: OrderItemWithSupplyContext[],
    session?: DeliverySession,
  ): Record<number, GroupSummary> {
    const filteredOrderItems = session
      ? orderItems.filter((item) => item.deliverySession === session)
      : orderItems;

    const summariesByBrand = new Map<
      number,
      {
        brandName: string;
        products: Product[];
        seenProductIds: Set<number>;
        rowsByGroupId: Map<number, GroupSummaryRow>;
      }
    >();

    for (const item of filteredOrderItems) {
      const product = item.master_product;
      const brandId = product.master_brand.id;
      const brandName = product.master_brand.name;

      let brandSummary = summariesByBrand.get(brandId);

      if (!brandSummary) {
        brandSummary = {
          brandName,
          products: [],
          seenProductIds: new Set<number>(),
          rowsByGroupId: new Map<number, GroupSummaryRow>(),
        };

        summariesByBrand.set(brandId, brandSummary);
      }

      if (!brandSummary.seenProductIds.has(product.id)) {
        brandSummary.seenProductIds.add(product.id);
        brandSummary.products.push(product);
      }

      let row = brandSummary.rowsByGroupId.get(item.groupId);

      if (!row) {
        row = {
          groupId: item.groupId,
          groupName: item.groupName,
        };

        brandSummary.rowsByGroupId.set(item.groupId, row);
      }

      accumulateProductField(row, item.productId, Number(item.orderedQty ?? 0));
    }

    const summaries: Record<number, GroupSummary> = {};

    for (const [brandId, brandSummary] of summariesByBrand) {
      const rows = Array.from(brandSummary.rowsByGroupId.values());

      const columns = this.productColumnsBuilder.buildGroupedColumns(
        brandSummary.products,
        true,
      );

      const totals = sumNumericFields(rows, ['groupId', 'groupName']);

      summaries[brandId] = {
        brandId,
        brandName: brandSummary.brandName,
        products: brandSummary.products,
        columns,
        rows,
        totals,
      };
    }

    return summaries;
  }
}
