import { Injectable } from '@nestjs/common';

import { SupplyCategory } from '../../generated/prisma/client.js';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';

import {
  DeliveredItemWithSupplyContext,
  Product,
  Summary,
} from '../../types/delivery-summary.types.js';

@Injectable()
export class DeliverySummaryBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildBillingGroupSummary(
  deliveredItems: DeliveredItemWithSupplyContext[],
) {
  type SummaryBuilder = Summary & {
    products: Product[];
  };

  const summariesMap = new Map<string, SummaryBuilder>();

  for (const item of deliveredItems) {
    const product = item.master_product;

    const brandId = product.master_brand.id;
    const brandName = product.master_brand.name;
    const productGroupId = product.master_product_group.id;
    const productGroupName = product.master_product_group.name;

    const summaryKey = `${item.distributorId}_${item.category}_${brandId}_${productGroupId}`;

    let summary = summariesMap.get(summaryKey);

    if (!summary) {
      summary = {
        summaryKey,
        distributorId: item.distributorId,
        category: item.category,
        brandId,
        brandName,
        productGroupId,
        productGroupName,
        columns: [],
        rows: [],
        products: [],
      };

      summariesMap.set(summaryKey, summary);
    }

    if (!summary.products.some((p) => p.id === product.id)) {
      summary.products.push(product);
    }

    let row = summary.rows.find(
      (r) => r.groupId === item.billingGroupId,
    );

    if (!row) {
      row = {
        groupId: item.billingGroupId,
        groupName: item.billingGroupName,
      };

      summary.rows.push(row);
    }

    const field = `product_${item.productId}`;

    const currentValue =
      typeof row[field] === 'number' ? row[field] : 0;

    row[field] = currentValue + item.deliveredQty;
  }

  const summaries: Summary[] = [];

  for (const summary of summariesMap.values()) {
    summaries.push({
      summaryKey: summary.summaryKey,
      distributorId: summary.distributorId,
      category: summary.category,
      brandId: summary.brandId,
      brandName: summary.brandName,
      productGroupId: summary.productGroupId,
      productGroupName: summary.productGroupName,
      columns: this.buildColumns(
        summary.products,
        summary.category === SupplyCategory.NON_MILK,
      ),
      rows: summary.rows,
    });
  }

  return {
    summaries,
  };
}

  private buildColumns(
    products: Product[],
    includePackagingType: boolean,
  ): ProductColumnNode[] {
    const columns = this.productColumnsBuilder.buildGroupedColumns(
      products,
      'morning',
      includePackagingType,
    );

    const updateFields = (nodes: ProductColumnNode[]) => {
      for (const node of nodes) {
        if (node.field && node.productId) {
          node.field = `product_${node.productId}`;
        }

        if (node.children) {
          updateFields(node.children);
        }
      }
    };

    updateFields(columns);

    return columns;
  }
}
