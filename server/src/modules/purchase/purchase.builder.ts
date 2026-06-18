import { Injectable } from '@nestjs/common';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';

import {
  VehicleAssignment,
  ProcurementRule,
} from '../../types/purchase.types.js';
import { Prisma } from '../../generated/prisma/client.js';

type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

type VehicleAllocation = Prisma.vehicle_allocationGetPayload<{
  include: {
    master_vehicle: true;
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
      };
    };
  };
}>;

type PurchaseEntry = Prisma.purchase_entryGetPayload<{}>;

type DistributorRate = Prisma.distributor_product_rateGetPayload<{}>;

type PurchaseRow = {
  vehicleId: number;
  vehicleName: string | null;
  [key: string]: string | number | null;
};

type PurchaseGridItem = {
  purchaseKey: string;
  distributorId: number;
  distributorName: string;
  brandId: number;
  brandName: string;
  productGroupId: number;
  productGroupName: string;
  columns: ProductColumnNode[];
  rows: PurchaseRow[];
};

type PurchaseGrid = {
  purchases: PurchaseGridItem[];
};

@Injectable()
export class PurchaseBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildPurchaseGrids(
    procurementRules: ProcurementRule[],

    products: Product[],

    vehicleAssignments: VehicleAssignment[],
  ): PurchaseGrid {
    const purchaseGrids: PurchaseGridItem[] = [];

    for (const rule of procurementRules) {
      const gridProducts = products.filter(
        (product) =>
          product.brand_id === rule.brand_id &&
          product.product_group_id === rule.product_group_id,
      );

      if (gridProducts.length === 0) {
        continue;
      }

      const columns = this.buildPurchaseColumns(
        gridProducts,

        rule.master_product_group.name !== 'Milk',
      );

      const productFields = initializeProductFields(columns);

      const assignedVehicles = vehicleAssignments.filter(
        (assignment) => assignment.distributor_id === rule.distributor_id,
      );

      if (assignedVehicles.length === 0) {
        continue;
      }

      const rows = assignedVehicles.map((assignment) => ({
        vehicleId: assignment.vehicle_id,

        vehicleName: assignment.master_vehicle.vehicle_name,

        ...structuredClone(productFields),
      }));
      purchaseGrids.push({
        purchaseKey: `${rule.distributor_id}_${rule.brand_id}_${rule.product_group_id}`,

        distributorId: rule.distributor_id,

        distributorName: rule.master_distributor.name,

        brandId: rule.brand_id,

        brandName: rule.master_brand.name,

        productGroupId: rule.product_group_id,

        productGroupName: rule.master_product_group.name,

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

      'night',

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

      for (const grid of result.purchases) {
        const row = grid.rows.find(
          (vehicle) => vehicle.vehicleId === allocation.vehicle_id,
        );

        if (row) {
          row[allocatedField] = Number(allocation.allocated_qty);

          row[purchasedField] = Number(allocation.allocated_qty);

          break;
        }
      }
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

      const allocatedField = `product_${entry.product_id}_allocated`;

      const grid = result.purchases.find(
        (purchase) => purchase.distributorId === entry.distributor_id,
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

      if (row) {
        row[allocatedField] = Number(entry.allocated_qty ?? 0);

        row[purchasedField] = Number(entry.purchased_qty);

        row[rateField] = Number(entry.purchase_rate);

        row[amountField] = Number(entry.purchase_amount);
      }
    }

    return result;
  }

  applyDistributorRates(
    purchaseGrids: PurchaseGrid,
    distributorRates: DistributorRate[],
  ) {
    const result = structuredClone(purchaseGrids);

    for (const rate of distributorRates) {
      const grid = result.purchases.find(
        (purchase: PurchaseGridItem) =>
          purchase.distributorId === rate.distributor_id,
      );

      if (!grid) {
        continue;
      }

      const rateField = `product_${rate.product_id}_rate`;

      for (const row of grid.rows) {
        row[rateField] = Number(rate.purchase_rate);

        const purchasedField = `product_${rate.product_id}_purchased`;

        const amountField = `product_${rate.product_id}_amount`;

        const amount =
          Number(row[purchasedField] ?? 0) * Number(rate.purchase_rate);

        row[amountField] = Number(amount.toFixed(2));
      }
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
