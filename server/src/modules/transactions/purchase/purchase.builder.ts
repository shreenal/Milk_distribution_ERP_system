import { Injectable } from '@nestjs/common';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../../common/builders/product-columns.builder.js';

import {
  VehicleAssignment,
  PurchaseEntry,
  PurchaseGrid,
  PurchaseGridItem,
  PurchaseRateDefault,
  VehicleAllocation,
  PurchaseVarianceAcknowledgement,
} from '../../../types/purchase.types.js';
import { DeliverySession, SupplyCategory } from '../../../generated/prisma/client.js';
import { QUANTITY_PRECISION } from './purchase.constants.js';

import {
  Product,
  AllocationSummary,
} from '../../../common/builders/allocation-summary.builder.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';

@Injectable()
export class PurchaseBuilder {
  constructor(
    private readonly productColumnsBuilder: ProductColumnsBuilder,
    private readonly purchaseVarianceCalculator: PurchaseVarianceCalculator,
  ) { }

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
        deliverySession: assignment.vehicle_allocation_paper.delivery_session,
        vehicleName: assignment.master_vehicle.vehicle_name,
        ...structuredClone(productFields),
      }));
      purchaseGrids.push({
        distributor: {
          id: summary.distributorId,
          name: distributorName,
        },
        category,
        brand: {
          id: summary.brandId,
          name: summary.brandName,
        },
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
      includePackagingType,
    );

    const updateFields = (nodes: ProductColumnNode[]) => {
      for (const node of nodes) {
        if (node.field && node.productId) {
          const productId = node.productId;

          node.children = [
            {
              headerName: 'Quantity',
              field: `product_${productId}`,
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
      // const allocatedField = `product_${allocation.product_id}_allocated`;
      // const purchasedField = `product_${allocation.product_id}_purchased`;
      const quantityField = `product_${allocation.product_id}`;

      const row = this.findPurchaseRow(
        result,
        allocation.distributor_id,
        allocation.category,
        allocation.vehicle_id,
        allocation.vehicle_allocation_paper.delivery_session,
        quantityField,
      );

      if (!row) {
        continue;
      }

      row[quantityField] = Number(allocation.allocated_qty);
    }

    return result;
  }

  applyPurchaseEntries(
    purchaseGrids: PurchaseGrid,
    purchaseEntries: PurchaseEntry[],
  ) {
    const result = structuredClone(purchaseGrids);

    for (const entry of purchaseEntries) {
      const quantityField = `product_${entry.product_id}`;
      const rateField = `product_${entry.product_id}_rate`;
      const amountField = `product_${entry.product_id}_amount`;

      const row = this.findPurchaseRow(
        result,
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        quantityField,
      );

      if (!row) {
        continue;
      }

      // row[purchasedField] = Number(entry.purchased_qty);

      row[quantityField] = Number(entry.purchased_qty);
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
      const quantityField = `product_${rate.productId}`;
      const rateField = `product_${rate.productId}_rate`;
      const amountField = `product_${rate.productId}_amount`;

      const row = this.findPurchaseRow(
        result,
        rate.distributorId,
        rate.category,
        rate.vehicleId,
        rate.deliverySession,
        quantityField,
      );

      if (!row) {
        continue;
      }

      row[rateField] = Number(rate.purchaseRate);

      const litres =
        Number(row[quantityField] ?? 0) *
        QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

      const amount = litres * Number(rate.purchaseRate);

      row[amountField] = Number(amount.toFixed(2));
    }

    return result;
  }

  applyVarianceMetadata(
    purchaseGrids: PurchaseGrid,
    allocations: VehicleAllocation[],
    purchaseEntries: PurchaseEntry[],
    acknowledgements: PurchaseVarianceAcknowledgement[],
  ) {
    const result = structuredClone(purchaseGrids);

    const allocationMap = new Map<string, VehicleAllocation>();

    for (const allocation of allocations) {
      allocationMap.set(
        this.buildVarianceKey(
          allocation.vehicle_id,
          allocation.distributor_id,
          allocation.category,
          allocation.product_id,
          allocation.vehicle_allocation_paper.delivery_session,
        ),
        allocation,
      );
    }

    const acknowledgementMap = new Map<
      number,
      PurchaseVarianceAcknowledgement
    >();

    for (const acknowledgement of acknowledgements) {
      acknowledgementMap.set(
        acknowledgement.purchase_entry.id,
        acknowledgement,
      );
    }

    for (const entry of purchaseEntries) {
      const key = this.buildVarianceKey(
        entry.vehicle_id,
        entry.distributor_id,
        entry.category,
        entry.product_id,
        entry.delivery_session,
      );

      const allocation = allocationMap.get(key);

      if (!allocation) {
        continue;
      }

      const acknowledgement =
        acknowledgementMap.get(entry.id) ?? null;

      const quantityField = `product_${entry.product_id}`;

      const row = this.findPurchaseRow(
        result,
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        quantityField,
      );

      if (!row) {
        continue;
      }

      const variance =
        this.purchaseVarianceCalculator.calculate(
          Number(allocation.allocated_qty),
          Number(entry.purchased_qty),
        );

      const varianceField = `product_${entry.product_id}_variance`;

      row[varianceField] = {
        allocatedQty: Number(allocation.allocated_qty),
        purchasedQty: Number(entry.purchased_qty),

        hasVariance: variance.hasVariance,
        variance: variance.variance,
        variancePercentage: variance.variancePercentage,
        severity: variance.severity,
        acknowledgement,
      };

    }

    return result;
  }

  private findPurchaseRow(
    purchaseGrids: PurchaseGrid,
    distributorId: number,
    category: SupplyCategory,
    vehicleId: number,
    deliverySession: DeliverySession,
    productField: string,
  ) {
    const grid = purchaseGrids.purchases.find(
      (purchase) =>
        purchase.distributor.id === distributorId &&
        purchase.category === category &&
        purchase.rows.some((row) => productField in row),
    );

    if (!grid) {
      return null;
    }

    const row = grid.rows.find(
      (vehicle) =>
        vehicle.vehicleId === vehicleId &&
        vehicle.deliverySession === deliverySession,
    );

    if (!row) {
      return null;
    }

    return row;
  }

  private buildVarianceKey(
    vehicleId: number,
    distributorId: number,
    category: SupplyCategory,
    productId: number,
    deliverySession: DeliverySession,
  ) {
    return `${vehicleId}_${distributorId}_${category}_${productId}_${deliverySession}`;
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
