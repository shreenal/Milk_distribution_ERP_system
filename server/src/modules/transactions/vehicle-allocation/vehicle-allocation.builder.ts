import { Injectable } from '@nestjs/common';
import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../../common/builders/product-columns.builder.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import {
  Vehicle,
  VehicleAllocation,
  DynamicProductFields,
  VehicleAllocationRow,
  AllocationGrid,
  AllocationGridResult,
  AllocationCoverageLine,
  Product,
} from '../../../types/vehicle-allocation.types.js';

import { AllocationSummary } from '../../../common/builders/allocation-summary.builder.js';
import { sumNumericFields } from '../../../common/builders/row-aggregation.util.js';
import {
  Decimal,
  moneyEquals,
  toDecimal,
  toFixedNumber,
} from '../../../common/utils/money.util.js';
import { VEHICLE_ALLOCATION_LIMITS } from './vehicle-allocation.constants.js';
import {
  buildRequirementKey,
  describeProduct,
} from './vehicle-allocation.util.js';

const IDENTITY_KEYS = ['groupId', 'groupName'];

@Injectable()
export class VehicleAllocationBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  private buildVehicleCapacityColumns(
    products: Product[],
    includePackagingType: boolean,
  ): ProductColumnNode[] {
    return this.productColumnsBuilder.buildGroupedColumns(
      products,
      includePackagingType,
    );
  }

  /**
   * VA-3.3: products whose total required quantity is zero are not part
   * of the allocation grid, the required keys or the coverage check. Done here
   * (not in the shared AllocationSummaryBuilder, which Purchase also uses).
   */
  filterPositiveDemand(summaries: AllocationSummary[]): AllocationSummary[] {
    const result: AllocationSummary[] = [];

    for (const summary of summaries) {
      const totals = sumNumericFields(summary.rows, IDENTITY_KEYS);
      const keep = new Set(
        Object.entries(totals)
          .filter(([, value]) => toDecimal(value).greaterThan(0))
          .map(([field]) => field),
      );

      const products = summary.products.filter((p) =>
        keep.has(`product_${p.id}`),
      );

      if (products.length === 0) continue;

      result.push({
        ...summary,
        products,
        rows: summary.rows.map((row) => {
          const kept: typeof row = {
            groupId: row.groupId,
            groupName: row.groupName,
          };
          for (const [field, value] of Object.entries(row)) {
            if (keep.has(field)) kept[field] = value;
          }
          return kept;
        }),
      });
    }

    return result;
  }

  /** distributor + category + product -> required quantity (positive only). */
  buildRequiredTotals(summaries: AllocationSummary[]): Map<string, number> {
    const required = new Map<string, number>();

    for (const summary of summaries) {
      const totals = sumNumericFields(summary.rows, IDENTITY_KEYS);
      for (const product of summary.products) {
        const total = toFixedNumber(toDecimal(totals[`product_${product.id}`]));
        if (total > 0) {
          required.set(
            buildRequirementKey(
              summary.distributorId,
              summary.category,
              product.id,
            ),
            total,
          );
        }
      }
    }

    return required;
  }

  buildProductLabelMap(summaries: AllocationSummary[]): Map<number, string> {
    const labels = new Map<number, string>();
    for (const summary of summaries) {
      for (const product of summary.products) {
        labels.set(product.id, describeProduct(product));
      }
    }
    return labels;
  }

  buildVehicleAllocationGrids(
    summaries: AllocationSummary[],
    vehicles: Vehicle[],
  ): AllocationGridResult {
    const allocations: AllocationGrid[] = [];

    for (const summary of summaries) {
      const rows: VehicleAllocationRow[] = [];

      const columns = this.buildVehicleCapacityColumns(
        summary.products,
        summary.category === SupplyCategory.NON_MILK,
      );

      const productFields = initializeProductFields(columns);

      for (const vehicle of vehicles) {
        rows.push({
          vehicleId: vehicle.id,

          vehicleName: vehicle.vehicle_name,

          ...structuredClone(productFields),
        });
      }

      const rawTotals = sumNumericFields(summary.rows, IDENTITY_KEYS);
      const totals: DynamicProductFields = {};
      for (const [field, value] of Object.entries(rawTotals)) {
        totals[field] = toFixedNumber(toDecimal(value));
      }

      allocations.push({
        distributor: {
          id: summary.distributorId,
          name: summary.distributorName,
        },
        category: summary.category,
        brand: {
          id: summary.brandId,
          name: summary.brandName,
        },
        columns,
        rows,
        totals,
      });
    }

    return {
      allocations,
    };
  }

  applyVehicleAllocations(
    allocationGrids: AllocationGridResult,
    savedAllocations: VehicleAllocation[],
  ) {
    const result = structuredClone(allocationGrids);
    const gridByKey = new Map<string, (typeof result.allocations)[number]>();
    for (const grid of result.allocations) {
      for (const row of grid.rows) {
        for (const field of Object.keys(row)) {
          if (!field.startsWith('product_')) continue;
          const key = `${grid.distributor.id}_${grid.category}_${field}`;
          if (!gridByKey.has(key)) {
            gridByKey.set(key, grid);
          }
        }
      }
    }

    const rowIndexByGrid = new Map<
      (typeof result.allocations)[number],
      Map<number, VehicleAllocationRow>
    >();

    for (const allocation of savedAllocations) {
      const field = `product_${allocation.product_id}`;

      const grid = gridByKey.get(
        `${allocation.distributor_id}_${allocation.category}_${field}`,
      );

      if (!grid) {
        continue;
      }

      let rowIndex = rowIndexByGrid.get(grid);
      if (!rowIndex) {
        rowIndex = new Map(grid.rows.map((row) => [row.vehicleId, row]));
        rowIndexByGrid.set(grid, rowIndex);
      }

      const row = rowIndex.get(allocation.vehicle_id);

      if (row) {
        row[field] = Number(allocation.allocated_qty);
      }
    }

    return result;
  }

  /**
   * VA-8 layer 1: one line per product with positive demand. Used by the grid
   * (completion indicators) and by the submission gate, so both agree.
   */
  calculateCoverage(
    grids: AllocationGridResult,
    productLabels: Map<number, string>,
  ): AllocationCoverageLine[] {
    const lines: AllocationCoverageLine[] = [];

    for (const grid of grids.allocations) {
      for (const [field, requiredQty] of Object.entries(grid.totals)) {
        const allocated = grid.rows.reduce(
          (sum, row) => sum.plus(toDecimal(row[field] ?? 0)),
          new Decimal(0),
        );
        const productId = Number(field.replace('product_', ''));

        lines.push({
          distributorId: grid.distributor.id,
          distributorName: grid.distributor.name,
          category: grid.category,
          productId,
          productName: productLabels.get(productId) ?? `product #${productId}`,
          field,
          requiredQty,
          allocatedQty: toFixedNumber(allocated),
          isComplete: moneyEquals(
            allocated,
            toDecimal(requiredQty),
            VEHICLE_ALLOCATION_LIMITS.COVERAGE_TOLERANCE,
          ),
        });
      }
    }

    return lines;
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
