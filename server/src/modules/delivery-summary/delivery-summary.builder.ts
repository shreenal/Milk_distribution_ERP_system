import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';

type DeliveredItem = Prisma.order_sheet_itemsGetPayload<{
  include: {
    master_client: {
      include: {
        billing_group: true;
      };
    };
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
        master_product_type: true;
        master_packaging_type: true;
      };
    };
  };
}>;

type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

type SummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};

type Summary = {
  summaryKey: string;
  brandId: number;
  brandName: string;
  productGroupId: number;
  productGroupName: string;
  columns: ProductColumnNode[];
  rows: SummaryRow[];
};

@Injectable()
export class DeliverySummaryBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildBillingGroupSummary(
    deliveredItems: DeliveredItem[],
    products: Product[],
  ) {
    type SummaryBuilder = Summary & {
      products: Product[];
    };

    const summariesMap = new Map<string, SummaryBuilder>();

    for (const product of products) {
      const key = `${product.master_brand.id}_${product.master_product_group.id}`;

      if (!summariesMap.has(key)) {
        summariesMap.set(key, {
          summaryKey: key,

          brandId: product.master_brand.id,
          brandName: product.master_brand.name,

          productGroupId: product.master_product_group.id,
          productGroupName: product.master_product_group.name,

          products: [],
          rows: [],
          columns: [],
        });
      }

      summariesMap.get(key)?.products.push(product);
    }

    const summaryRowsMap = new Map<string, SummaryRow>();

    for (const item of deliveredItems) {
      const billingGroup = item.master_client.billing_group;

      const summaryKey = `${item.master_product.master_brand.id}_${item.master_product.master_product_group.id}`;

      const rowKey = `${summaryKey}_${billingGroup.id}`;

      if (!summaryRowsMap.has(rowKey)) {
        summaryRowsMap.set(rowKey, {
          groupId: billingGroup.id,

          groupName: billingGroup.name,
        });
      }

      const row = summaryRowsMap.get(rowKey);

      if (!row) {
        continue;
      }

      const field = `product_${item.product_id}`;

      const currentValue = typeof row[field] === 'number' ? row[field] : 0;

      row[field] = currentValue + Number(item.delivered_qty ?? 0);
    }

    for (const [rowKey, row] of summaryRowsMap) {
      const summaryKey = rowKey.split('_').slice(0, 2).join('_');

      const summary = summariesMap.get(summaryKey);

      if (!summary) {
        continue;
      }

      summary.rows.push(row);
    }

    const summaries: Summary[] = [];

    for (const summary of summariesMap.values()) {
      summaries.push({
        summaryKey: summary.summaryKey,

        brandId: summary.brandId,
        brandName: summary.brandName,

        productGroupId: summary.productGroupId,
        productGroupName: summary.productGroupName,

        columns: this.buildColumns(
          summary.products,
          summary.productGroupName !== 'Milk',
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
