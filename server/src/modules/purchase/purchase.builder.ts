import { Injectable } from '@nestjs/common';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';

import {
  VehicleAssignment,
  PurchaseEntry,
  PurchaseGrid,
  PurchaseGridItem,
  PurchaseRateDefault,
  VehicleAllocation,
} from '../../types/purchase.types.js';
import { SupplyCategory } from '../../generated/prisma/client.js';
import { QUANTITY_PRECISION } from './purchase.constants.js';

import {
  Product,
  AllocationSummary,
} from '../../common/builders/allocation-summary.builder.js';

@Injectable()
export class PurchaseBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildPurchaseGrids(
    summaries: AllocationSummary[],
    vehicleAssignments: VehicleAssignment[],
  ): PurchaseGrid {
    const purchaseGrids: PurchaseGridItem[] = [];

    for (const summary of summaries) {
      const gridProducts = summary.products;

      if (gridProducts.length === 0) {
        continue;
      }

      const category = summary.category;

      const columns = this.buildPurchaseColumns(
        gridProducts,
        category === SupplyCategory.NON_MILK,
      );

      const productFields = initializeProductFields(columns);

      const assignedVehicles = vehicleAssignments.filter(
        (assignment) =>
          assignment.distributor_id === summary.distributorId &&
          assignment.category === summary.category,
      );

      if (assignedVehicles.length === 0) {
        continue;
      }

      const distributorName =
        assignedVehicles[0]?.master_distributor.name ?? '';

      const rows = assignedVehicles.map((assignment) => ({
        vehicleId: assignment.vehicle_id,

        vehicleName: assignment.master_vehicle.vehicle_name,

        ...structuredClone(productFields),
      }));
      purchaseGrids.push({
        purchaseKey: summary.summaryKey,
        distributorId: summary.distributorId,
        distributorName,
        category,
        brandId: summary.brandId,
        brandName: summary.brandName,
        columns,
        rows,
      });
    }

    return {
      purchases: purchaseGrids,
    };
  }

  private buildPurchaseColumns(
    products: Product[],

    includePackagingType: boolean,
  ) {
    const columns = this.productColumnsBuilder.buildGroupedColumns(
      products,

      'ordered',

      includePackagingType,
    );

    const updateFields = (nodes: ProductColumnNode[]) => {
      for (const node of nodes) {
        if (node.field && node.productId) {
          const productId = node.productId;

          node.children = [
            {
              headerName: 'Allocated',
              field: `product_${productId}_allocated`,
              productId,
              children: [],
            },

            {
              headerName: 'Purchased',
              field: `product_${productId}_purchased`,
              productId,
              editable: true,
              children: [],
            },

            {
              headerName: 'Rate',
              field: `product_${productId}_rate`,
              productId,
              children: [],
            },

            {
              headerName: 'Amount',
              field: `product_${productId}_amount`,
              productId,
              children: [],
            },
          ];

          delete node.field;
          continue;
        }

        if (node.children) {
          updateFields(node.children);
        }
      }
    };

    updateFields(columns);

    return columns;
  }

  applyVehicleAllocations(
    purchaseGrids: PurchaseGrid,
    allocations: VehicleAllocation[],
  ) {
    const result = structuredClone(purchaseGrids);

    for (const allocation of allocations) {
      const allocatedField = `product_${allocation.product_id}_allocated`;
      const purchasedField = `product_${allocation.product_id}_purchased`;

      const grid = result.purchases.find(
        (purchase) =>
          purchase.distributorId === allocation.distributor_id &&
          purchase.category === allocation.category &&
          purchase.rows.some((row) => allocatedField in row),
      );

      if (!grid) {
        continue;
      }

      const row = grid.rows.find(
        (vehicle) => vehicle.vehicleId === allocation.vehicle_id,
      );

      if (!row) {
        continue;
      }

      row[allocatedField] = Number(allocation.allocated_qty);
      row[purchasedField] = Number(allocation.allocated_qty);
    }

    return result;
  }

  applyPurchaseEntries(
    purchaseGrids: PurchaseGrid,
    purchaseEntries: PurchaseEntry[],
  ) {
    const result = structuredClone(purchaseGrids);

    for (const entry of purchaseEntries) {
      const purchasedField = `product_${entry.product_id}_purchased`;
      const rateField = `product_${entry.product_id}_rate`;
      const amountField = `product_${entry.product_id}_amount`;

      const grid = result.purchases.find(
        (purchase) =>
          purchase.distributorId === entry.distributor_id &&
          purchase.category === entry.category &&
          purchase.rows.some((row) => purchasedField in row),
      );

      if (!grid) {
        continue;
      }

      const row = grid.rows.find(
        (vehicle) => vehicle.vehicleId === entry.vehicle_id,
      );

      if (!row) {
        continue;
      }

      row[purchasedField] = Number(entry.purchased_qty);
      row[rateField] = Number(entry.purchase_rate);
      row[amountField] = Number(entry.purchase_amount);
    }

    return result;
  }

  applyPurchaseRates(
    purchaseGrids: PurchaseGrid,
    rateDefaults: PurchaseRateDefault[],
  ) {
    const result = structuredClone(purchaseGrids);

    for (const rate of rateDefaults) {
      const purchasedField = `product_${rate.productId}_purchased`;
      const rateField = `product_${rate.productId}_rate`;
      const amountField = `product_${rate.productId}_amount`;

      const grid = result.purchases.find(
        (purchase) =>
          purchase.distributorId === rate.distributorId &&
          purchase.category === rate.category &&
          purchase.rows.some((row) => purchasedField in row),
      );

      if (!grid) {
        continue;
      }

      const row = grid.rows.find(
        (vehicle) => vehicle.vehicleId === rate.vehicleId,
      );

      if (!row) {
        continue;
      }

      row[rateField] = Number(rate.purchaseRate);

      const litres =
        Number(row[purchasedField] ?? 0) *
        QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

      const amount = litres * Number(rate.purchaseRate);

      row[amountField] = Number(amount.toFixed(2));
    }

    return result;
  }
}

const initializeProductFields = (
  columns: ProductColumnNode[],
): Record<string, number> => {
  const row: Record<string, number> = {};

  const walk = (nodes: ProductColumnNode[]) => {
    for (const node of nodes) {
      if (node.field) {
        row[node.field] = 0;
      }

      if (node.children) {
        walk(node.children);
      }
    }
  };

  walk(columns);

  return row;
};
