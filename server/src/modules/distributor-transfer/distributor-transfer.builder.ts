import { BadRequestException, Injectable } from '@nestjs/common';
import { SupplyCategory } from '../../generated/prisma/client.js';
import {
  ProductColumnNode,
  ProductColumnsBuilder,
} from '../../common/builders/product-columns.builder.js';
import {
  Product,
  TransferGrid,
  TransferSourceItem,
  TransferSummaryBuilder,
} from '../../types/distributor-transfer.types.js';

@Injectable()
export class DistributorTransferBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}
  buildTransferSummary(
    sourceItems: TransferSourceItem[],
  ): TransferSummaryBuilder[] {
    const summaries = new Map<string, TransferSummaryBuilder>();

    for (const item of sourceItems) {
      const qty = Number(item.delivered_qty ?? 0);

      if (qty <= 0) {
        continue;
      }

      const category = item.master_product.master_product_group.category;

      const supplyRule = item.order_sheet.master_group.supply_rules.find(
        (rule) => rule.category === category,
      );

      if (!supplyRule) {
        throw new BadRequestException(
          `Missing supply rule for group ${item.order_sheet.master_group.name} and category ${category}`,
        );
      }

      const supplierDistributorId = supplyRule.distributor_id;
      const ownerDistributorId = item.master_client.owner_distributor_id;

      if (supplierDistributorId === ownerDistributorId) {
        continue;
      }

      const product = item.master_product;

      const transferKey =
        `${supplierDistributorId}_` +
        `${ownerDistributorId}_` +
        `${product.brand_id}_` +
        `${product.product_group_id}`;

      let summary = summaries.get(transferKey);

      if (!summary) {
        summary = {
          transferKey,

          supplierDistributorId,
          supplierDistributorName: supplyRule.distributor.name,

          ownerDistributorId,
          ownerDistributorName: item.master_client.owner_distributor.name,

          brandId: product.brand_id,
          brandName: product.master_brand.name,

          productGroupId: product.product_group_id,
          productGroupName: product.master_product_group.name,

          rows: [],

          products: [],
        };

        summaries.set(transferKey, summary);
      }

      if (!summary.products.some((p) => p.id === product.id)) {
        summary.products.push(product);
      }

      let row = summary.rows.find(
        (r) => r.billingGroupId === item.master_client.billing_group_id,
      );

      if (!row) {
        row = {
          billingGroupId: item.master_client.billing_group_id,
          billingGroupName: item.master_client.billing_group.name,
        };

        summary.rows.push(row);
      }

      const field = `product_${product.id}`;

      row[field] = Number(row[field] ?? 0) + qty;
    }

    return Array.from(summaries.values());
  }

  private buildTransferColumns(
    products: Product[],
    includePackagingType: boolean,
  ): ProductColumnNode[] {
    const columns = this.productColumnsBuilder.buildGroupedColumns(
      products,
      'delivered',
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

  buildTransferGrids(summaries: TransferSummaryBuilder[]): {
    transfers: TransferGrid[];
  } {
    const transfers: TransferGrid[] = [];

    for (const summary of summaries) {
      const firstProduct = summary.products[0];

      if (!firstProduct) {
        continue;
      }

      const includePackagingType =
        firstProduct.master_product_group.category === SupplyCategory.NON_MILK;
      transfers.push({
        transferKey: summary.transferKey,

        supplierDistributorId: summary.supplierDistributorId,
        supplierDistributorName: summary.supplierDistributorName,

        ownerDistributorId: summary.ownerDistributorId,
        ownerDistributorName: summary.ownerDistributorName,

        brandId: summary.brandId,
        brandName: summary.brandName,

        productGroupId: summary.productGroupId,
        productGroupName: summary.productGroupName,

        columns: this.buildTransferColumns(
          summary.products,
          includePackagingType,
        ),

        rows: summary.rows,
      });
    }

    return {
      transfers,
    };
  }
}
