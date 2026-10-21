import { Injectable } from '@nestjs/common';

import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../../common/builders/product-columns.builder.js';

import {
  PurchaseCellMeta,
  PurchaseGrid,
  PurchaseGridItem,
  PurchaseRateDefault,
  PurchaseTotals,
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
import { sumNumericFields } from '../../../common/builders/row-aggregation.util.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { buildPurchaseKey } from '../../../common/utils/allocation-key.util.js';
import {
  Decimal,
  toDecimal,
  toMoney,
} from '../../../common/utils/money.util.js';
import {
  describeProduct,
  describeVehicle,
} from '../vehicle-allocation/vehicle-allocation.util.js';
import { PurchaseRepository } from './purchase.repository.js';
import { isStaleEntry } from './purchase.util.js';

export type SavedPurchaseEntry = Awaited<
  ReturnType<PurchaseRepository['findPurchaseEntries']>
>[number];

export type OrphanedPurchaseEntry = {
  entryId: number;
  vehicleId: number;
  vehicleName: string;
  distributorId: number;
  distributorName: string;
  category: SupplyCategory;
  productId: number;
  productName: string;
  deliverySession: DeliverySession;
  purchasedQty: number;
  purchaseRate: number;
  purchaseAmount: number;
};

export type PurchaseGridWithMeta = PurchaseGrid & {
  orphanedEntries: OrphanedPurchaseEntry[];
};

const IDENTITY_KEYS = ['groupId', 'groupName'];

const metaField = (productId: number | string) => `product_${productId}_meta`;

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

  /**
   * PD-50 (same scope as Vehicle Allocation VA-3.3): a product is a column when
   * it has positive ordered demand across both sessions.
   * Kept here because the shared AllocationSummaryBuilder is also used by
   * other modules.
   */
  private filterPositiveDemand(summaries: AllocationSummary[]) {
    return summaries
      .map((summary) => {
        const totals = sumNumericFields(summary.rows, IDENTITY_KEYS);
        return {
          ...summary,
          products: summary.products.filter((p) =>
            toDecimal(totals[`product_${p.id}`]).greaterThan(0),
          ),
        };
      })
      .filter((summary) => summary.products.length > 0);
  }

  /**
   * PD-49 / PD-51: the grid is built from BOTH sources.
   *  - columns: products with positive order demand (PD-50), plus any product
   *    that has an active allocation (so an allocation can never be left
   *    without a cell to purchase it in);
   *  - rows: only vehicles that have an active allocation for THIS brand.
   */
  buildPurchaseGrids(
    summaries: AllocationSummary[],
    allocations: VehicleAllocation[],
  ): PurchaseGrid {
    type Seed = {
      distributor: { id: number; name: string };
      category: SupplyCategory;
      brand: { id: number; name: string };
      products: Map<number, Product>;
    };
    const seeds = new Map<string, Seed>();
    const seedKey = (d: number, c: SupplyCategory, b: number) =>
      `${d}_${c}_${b}`;

    for (const summary of this.filterPositiveDemand(summaries)) {
      seeds.set(
        seedKey(summary.distributorId, summary.category, summary.brandId),
        {
          distributor: {
            id: summary.distributorId,
            name: summary.distributorName,
          },
          category: summary.category,
          brand: { id: summary.brandId, name: summary.brandName },
          products: new Map(summary.products.map((p) => [p.id, p])),
        },
      );
    }

    for (const allocation of allocations) {
      if (Number(allocation.allocated_qty) <= 0) continue;
      const product = allocation.master_product;
      const key = seedKey(
        allocation.distributor_id,
        allocation.category,
        product.master_brand.id,
      );
      let seed = seeds.get(key);
      if (!seed) {
        seed = {
          distributor: {
            id: allocation.distributor_id,
            name: allocation.distributor.name,
          },
          category: allocation.category,
          brand: {
            id: product.master_brand.id,
            name: product.master_brand.name,
          },
          products: new Map(),
        };
        seeds.set(key, seed);
      }
      if (!seed.products.has(product.id)) {
        seed.products.set(product.id, product as unknown as Product);
      }
    }

    const purchaseGrids: PurchaseGridItem[] = [];

    for (const seed of seeds.values()) {
      const relevantAllocations = allocations.filter(
        (a) =>
          Number(a.allocated_qty) > 0 &&
          a.distributor_id === seed.distributor.id &&
          a.category === seed.category &&
          a.master_product.master_brand.id === seed.brand.id,
      );

      if (relevantAllocations.length === 0) continue;

      const columns = this.buildPurchaseColumns(
        [...seed.products.values()],
        seed.category === SupplyCategory.NON_MILK,
      );
      const productFields = initializeProductFields(columns);

      const vehicleMap = new Map<
        string,
        {
          vehicleId: number;
          deliverySession: DeliverySession;
          vehicleName: string | null;
        }
      >();

      for (const allocation of relevantAllocations) {
        const session = allocation.vehicle_allocation_paper.delivery_session;
        const key = `${allocation.vehicle_id}_${session}`;
        if (!vehicleMap.has(key)) {
          vehicleMap.set(key, {
            vehicleId: allocation.vehicle_id,
            deliverySession: session,
            vehicleName: allocation.master_vehicle.vehicle_name,
          });
        }
      }

      purchaseGrids.push({
        distributor: seed.distributor,
        category: seed.category,
        brand: seed.brand,
        columns,
        rows: Array.from(vehicleMap.values()).map((vehicle) => ({
          ...vehicle,
          ...structuredClone(productFields),
        })),
        totals: { estimatedTotalAmount: 0, persistedTotalAmount: 0 },
      });
    }

    return { purchases: purchaseGrids };
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

  /** Pre-fills each cell from its allocation and records the allocation to echo (PD-4). */
  applyVehicleAllocations(
    purchaseGrids: PurchaseGrid,
    allocations: VehicleAllocation[],
  ) {
    const index = new PurchaseRowIndex(purchaseGrids.purchases);

    for (const allocation of allocations) {
      const quantityField = `product_${allocation.product_id}`;

      const row = index.findRow(
        allocation.distributor_id,
        allocation.category,
        allocation.vehicle_id,
        allocation.vehicle_allocation_paper.delivery_session,
        quantityField,
      );

      if (!row) continue;

      row[quantityField] = Number(allocation.allocated_qty);
      row[metaField(allocation.product_id)] = {
        entryId: null,
        tracked: false,
        rateType: 'LIVE',
        rateStatus: 'OK',
        rateIssue: null,
        sourceAllocationId: allocation.id,
        sourceAllocatedQty: Number(allocation.allocated_qty),
        snapshotAllocationId: null,
        snapshotAllocatedQty: null,
      } satisfies PurchaseCellMeta;
    }

    return purchaseGrids;
  }

  /** Entries that cannot be drawn in any grid cell (PD-6 / PD-7). */
  findOrphanedEntries(
    purchaseGrids: PurchaseGrid,
    entries: SavedPurchaseEntry[],
  ): OrphanedPurchaseEntry[] {
    const index = new PurchaseRowIndex(purchaseGrids.purchases);
    const orphans: OrphanedPurchaseEntry[] = [];

    for (const entry of entries) {
      const row = index.findRow(
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        `product_${entry.product_id}`,
      );
      if (row) continue;

      orphans.push({
        entryId: entry.id,
        vehicleId: entry.vehicle_id,
        vehicleName: describeVehicle(entry.master_vehicle),
        distributorId: entry.distributor_id,
        distributorName: entry.distributor.name,
        category: entry.category,
        productId: entry.product_id,
        productName: describeProduct(entry.master_product),
        deliverySession: entry.delivery_session,
        purchasedQty: Number(entry.purchased_qty),
        purchaseRate: Number(entry.purchase_rate),
        purchaseAmount: Number(entry.purchase_amount),
      });
    }

    return orphans;
  }

  applyPurchaseEntries(
    purchaseGrids: PurchaseGrid,
    purchaseEntries: SavedPurchaseEntry[],
    currentAllocations: VehicleAllocation[],
  ): PurchaseGridWithMeta {
    const result = purchaseGrids as PurchaseGridWithMeta;
    result.orphanedEntries = this.findOrphanedEntries(
      purchaseGrids,
      purchaseEntries,
    );

    const index = new PurchaseRowIndex(result.purchases);

    const allocationByKey = new Map<string, VehicleAllocation>();
    for (const allocation of currentAllocations) {
      allocationByKey.set(
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

      const row = index.findRow(
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        quantityField,
      );
      if (!row) continue;

      const current = allocationByKey.get(buildPurchaseKey(entry));

      row[quantityField] = Number(entry.purchased_qty);
      row[`${quantityField}_rate`] = Number(entry.purchase_rate);
      row[`${quantityField}_amount`] = Number(entry.purchase_amount);
      // PD-37: legacy rows without a snapshot are never stale.
      row[`${quantityField}_stale`] = isStaleEntry(entry, current);
      row[metaField(entry.product_id)] = {
        entryId: entry.id,
        tracked: true,
        // PD-22: a saved entry always shows its frozen rate.
        rateType: 'FROZEN',
        rateStatus: 'OK',
        rateIssue: null,
        sourceAllocationId: current?.id ?? null,
        sourceAllocatedQty: current ? Number(current.allocated_qty) : null,
        snapshotAllocationId: entry.source_allocation_id,
        snapshotAllocatedQty:
          entry.source_allocated_qty === null
            ? null
            : Number(entry.source_allocated_qty),
      } satisfies PurchaseCellMeta;
    }

    return result;
  }

  /** Default rate and amount for cells that are not saved yet (PD-22, PD-48). */
  applyPurchaseRates(
    purchaseGrids: PurchaseGrid,
    rateDefaults: PurchaseRateDefault[],
  ) {
    const index = new PurchaseRowIndex(purchaseGrids.purchases);

    for (const rate of rateDefaults) {
      const quantityField = `product_${rate.productId}`;
      const rateField = `${quantityField}_rate`;
      const amountField = `${quantityField}_amount`;

      const row = index.findRow(
        rate.distributorId,
        rate.category,
        rate.vehicleId,
        rate.deliverySession,
        quantityField,
      );
      if (!row) continue;

      const meta = row[metaField(rate.productId)] as
        PurchaseCellMeta | undefined;

      if (
        rate.rateStatus === 'MISSING_CONFIGURATION' ||
        rate.purchaseRate === null ||
        rate.pricingQuantity === null
      ) {
        row[rateField] = null;
        row[amountField] = null;
        if (meta) {
          meta.rateStatus = 'MISSING_CONFIGURATION';
          meta.rateIssue = rate.rateIssue ?? null;
        }
        continue;
      }

      row[rateField] = Number(rate.purchaseRate);
      row[amountField] = this.purchaseBillingService.calculate(
        Number(row[quantityField] ?? 0),
        Number(rate.purchaseRate),
        rate.pricingQuantity,
      ).purchaseAmount;
    }

    return purchaseGrids;
  }

  /**
   * PD-45 / PD-46: estimated (unsaved, pre-filled defaults) and persisted
   * (saved entries) are kept apart at row, grid and overall level.
   */
  applyPurchaseTotals(purchaseGrids: PurchaseGrid): PurchaseTotals {
    let overallEstimated = new Decimal(0);
    let overallPersisted = new Decimal(0);

    for (const grid of purchaseGrids.purchases) {
      let gridEstimated = new Decimal(0);
      let gridPersisted = new Decimal(0);

      for (const row of grid.rows) {
        let estimated = new Decimal(0);
        let persisted = new Decimal(0);

        for (const [field, value] of Object.entries(row)) {
          if (
            !field.startsWith('product_') ||
            !field.endsWith('_amount') ||
            typeof value !== 'number'
          ) {
            continue;
          }
          const meta = row[`${field.slice(0, -'_amount'.length)}_meta`] as
            PurchaseCellMeta | undefined;
          if (!meta) continue;
          if (meta.tracked) persisted = persisted.plus(value);
          else estimated = estimated.plus(value);
        }

        row.estimatedTotalAmount = toMoney(estimated);
        row.persistedTotalAmount = toMoney(persisted);
        gridEstimated = gridEstimated.plus(estimated);
        gridPersisted = gridPersisted.plus(persisted);
      }

      grid.totals = {
        estimatedTotalAmount: toMoney(gridEstimated),
        persistedTotalAmount: toMoney(gridPersisted),
      };
      overallEstimated = overallEstimated.plus(gridEstimated);
      overallPersisted = overallPersisted.plus(gridPersisted);
    }

    return {
      estimatedTotalAmount: toMoney(overallEstimated),
      persistedTotalAmount: toMoney(overallPersisted),
    };
  }

  /** PD-43 / PD-44: variance always carries its direction/status. */
  applyVarianceMetadata(
    purchaseGrids: PurchaseGrid,
    allocations: VehicleAllocation[],
    purchaseEntries: SavedPurchaseEntry[],
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

    let hasCriticalShortfall = false;

    for (const entry of purchaseEntries) {
      const row = index.findRow(
        entry.distributor_id,
        entry.category,
        entry.vehicle_id,
        entry.delivery_session,
        `product_${entry.product_id}`,
      );
      if (!row) continue;

      const allocated = Number(
        allocationMap.get(buildPurchaseKey(entry))?.allocated_qty ?? 0,
      );
      const variance = this.purchaseVarianceCalculator.calculate(
        allocated,
        Number(entry.purchased_qty),
      );
      if (variance.shortfallWarning) hasCriticalShortfall = true;

      row[`product_${entry.product_id}_variance`] = {
        allocatedQty: allocated,
        purchasedQty: Number(entry.purchased_qty),
        ...variance,
      };
    }

    return { purchaseGrids, hasCriticalShortfall };
  }

  sumAmounts(values: unknown[]): number {
    return toMoney(
      values.reduce<Decimal>(
        (sum, v) => sum.plus(toDecimal(v as never)),
        new Decimal(0),
      ),
    );
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
