import { Injectable } from '@nestjs/common';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../../common/builders/product-columns.builder.js';

import {
  PurchaseEntry,
  PurchaseGrid,
  PurchaseGridItem,
  PurchaseRateDefault,
  VehicleAllocation,
} from '../../../types/purchase.types.js';
import {
  DeliverySession,
  SupplyCategory,
} from '../../../generated/prisma/client.js';

import {
  Product,
  AllocationSummary,
} from '../../../common/builders/allocation-summary.builder.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { buildPurchaseKey } from '../../../common/utils/allocation-key.util.js';

export type OrphanedPurchaseEntry = {
  vehicleId: number;
  distributorId: number;
  category: SupplyCategory;
  productId: number;
  deliverySession: DeliverySession;
  purchasedQty: number;
};

export type PurchaseGridWithMeta = PurchaseGrid & {
  orphanedEntries: OrphanedPurchaseEntry[];
};

class PurchaseRowIndex {
  private readonly gridByKey = new Map<string, PurchaseGridItem>();
  private readonly rowIndexByGrid = new Map<
    PurchaseGridItem,
    Map<string, PurchaseGridItem['rows'][number]>
  >();

  constructor(private readonly grids: PurchaseGridItem[]) {
    for (const grid of grids) {
      for (const row of grid.rows) {
        for (const field of Object.keys(row)) {
          if (!field.startsWith('product_')) continue;
          const key = `${grid.distributor.id}_${grid.category}_${field}`;
          if (!this.gridByKey.has(key)) {
            this.gridByKey.set(key, grid);
          }
        }
      }
    }
  }

  findRow(
    distributorId: number,
    category: SupplyCategory,
    vehicleId: number,
    deliverySession: DeliverySession,
    productField: string,
  ) {
    const grid = this.gridByKey.get(
      `${distributorId}_${category}_${productField}`,
    );

    if (!grid) {
      return null;
    }

    let rowIndex = this.rowIndexByGrid.get(grid);

    if (!rowIndex) {
      rowIndex = new Map();
      for (const row of grid.rows) {
        rowIndex.set(`${row.vehicleId}_${row.deliverySession}`, row);
      }
      this.rowIndexByGrid.set(grid, rowIndex);
    }

    return rowIndex.get(`${vehicleId}_${deliverySession}`) ?? null;
  }
}

@Injectable()
export class PurchaseBuilder {
  constructor(
    private readonly productColumnsBuilder: ProductColumnsBuilder,
    private readonly purchaseVarianceCalculator: PurchaseVarianceCalculator,
    private readonly purchaseBillingService: PurchaseBillingService,
  ) {}

  buildPurchaseGrids(
    summaries: AllocationSummary[],
    allocations: VehicleAllocation[],
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

      const relevantAllocations = allocations.filter(
        (allocation) =>
          allocation.distributor_id === summary.distributorId &&
          allocation.category === summary.category,
      );

      if (relevantAllocations.length === 0) {
        continue;
      }

      const distributorName = relevantAllocations[0]?.distributor.name ?? '';

      const vehicleMap = new Map<
        string,
        {
          vehicleId: number;
          deliverySession: DeliverySession;
          vehicleName: string | null;
        }
      >();

      for (const allocation of relevantAllocations) {
        const key = `${allocation.vehicle_id}_${allocation.vehicle_allocation_paper.delivery_session}`;

        if (!vehicleMap.has(key)) {
          vehicleMap.set(key, {
            vehicleId: allocation.vehicle_id,
            deliverySession:
              allocation.vehicle_allocation_paper.delivery_session,
            vehicleName: allocation.master_vehicle.vehicle_name,
          });
        }
      }

      const rows = Array.from(vehicleMap.values()).map((vehicle) => ({
        vehicleId: vehicle.vehicleId,
        deliverySession: vehicle.deliverySession,
        vehicleName: vehicle.vehicleName,
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
    const index = new PurchaseRowIndex(purchaseGrids.purchases);

    for (const allocation of allocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        continue;
      }

      const quantityField = `product_${allocation.product_id}`;

      const row = index.findRow(
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

    return purchaseGrids;
  }

  applyPurchaseEntries(
    purchaseGrids: PurchaseGrid,
    purchaseEntries: PurchaseEntry[],
    currentAllocations: VehicleAllocation[],
  ): PurchaseGridWithMeta {
    const result = purchaseGrids as PurchaseGridWithMeta;
    result.orphanedEntries = [];

    const index = new PurchaseRowIndex(result.purchases);

    const currentAllocationMap = new Map<string, VehicleAllocation>();

    for (const allocation of currentAllocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        continue;
      }

      currentAllocationMap.set(
        buildPurchaseKey({
          vehicleId: allocation.vehicle_id,
          distributorId: allocation.distributor_id,
          category: allocation.category,
          productId: allocation.product_id,
          deliverySession: allocation.vehicle_allocation_paper.delivery_session,
        }),
        allocation,
      );
    }

    for (const entry of purchaseEntries) {
      const quantityField = `product_${entry.product_id}`;
      const rateField = `product_${entry.product_id}_rate`;
      const amountField = `product_${entry.product_id}_amount`;
      const staleField = `product_${entry.product_id}_stale`;

      const row = index.findRow(
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        quantityField,
      );

      if (!row) {
        result.orphanedEntries.push({
          vehicleId: entry.vehicle_id,
          distributorId: entry.distributor_id,
          category: entry.category,
          productId: entry.product_id,
          deliverySession: entry.delivery_session,
          purchasedQty: Number(entry.purchased_qty),
        });
        continue;
      }

      const key = buildPurchaseKey(entry);

      const currentAllocation = currentAllocationMap.get(key);

      const sourceAllocationId = (
        entry as { source_allocation_id?: number | null }
      ).source_allocation_id;
      const sourceAllocatedQty = (entry as { source_allocated_qty?: unknown })
        .source_allocated_qty;

      const isStale =
        !currentAllocation ||
        sourceAllocationId == null ||
        currentAllocation.id !== sourceAllocationId ||
        Number(currentAllocation.allocated_qty) !==
          Number(sourceAllocatedQty ?? NaN);

      row[quantityField] = Number(entry.purchased_qty);
      row[rateField] = Number(entry.purchase_rate);
      row[amountField] = Number(entry.purchase_amount);
      row[staleField] = isStale;
    }

    return result;
  }

  applyPurchaseRates(
    purchaseGrids: PurchaseGrid,
    rateDefaults: PurchaseRateDefault[],
  ) {
    const index = new PurchaseRowIndex(purchaseGrids.purchases);

    for (const rate of rateDefaults) {
      const quantityField = `product_${rate.productId}`;
      const rateField = `product_${rate.productId}_rate`;
      const amountField = `product_${rate.productId}_amount`;

      const row = index.findRow(
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

      const { purchaseAmount } = this.purchaseBillingService.calculate(
        Number(row[quantityField] ?? 0),
        Number(rate.purchaseRate),
        rate.pricingQuantity,
      );

      row[amountField] = purchaseAmount;
    }

    return purchaseGrids;
  }

  applyPurchaseTotals(purchaseGrids: PurchaseGrid) {
    for (const grid of purchaseGrids.purchases) {
      for (const row of grid.rows) {
        const totalAmount = Object.entries(row)
          .filter(
            ([field, value]) =>
              field.startsWith('product_') &&
              field.endsWith('_amount') &&
              typeof value === 'number',
          )
          .reduce((total, [, value]) => total + Number(value), 0);

        row.totalAmount = totalAmount;
      }
    }

    return purchaseGrids;
  }

  applyVarianceMetadata(
    purchaseGrids: PurchaseGrid,
    allocations: VehicleAllocation[],
    purchaseEntries: PurchaseEntry[],
  ) {
    const index = new PurchaseRowIndex(purchaseGrids.purchases);

    const allocationMap = new Map<string, VehicleAllocation>();

    for (const allocation of allocations) {
      allocationMap.set(
        buildPurchaseKey({
          vehicleId: allocation.vehicle_id,
          distributorId: allocation.distributor_id,
          category: allocation.category,
          productId: allocation.product_id,
          deliverySession: allocation.vehicle_allocation_paper.delivery_session,
        }),
        allocation,
      );
    }

    for (const entry of purchaseEntries) {
      const key = buildPurchaseKey(entry);

      const allocation = allocationMap.get(key);

      if (!allocation) {
        continue;
      }

      const quantityField = `product_${entry.product_id}`;

      const row = index.findRow(
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        quantityField,
      );

      if (!row) {
        continue;
      }

      const variance = this.purchaseVarianceCalculator.calculate(
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
      };
    }

    return purchaseGrids;
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
