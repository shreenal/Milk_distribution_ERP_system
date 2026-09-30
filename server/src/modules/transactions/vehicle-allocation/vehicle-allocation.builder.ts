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
  Product,
} from '../../../types/vehicle-allocation.types.js';

import { AllocationSummary } from '../../../common/builders/allocation-summary.builder.js';
import { sumNumericFields } from '../../../common/builders/row-aggregation.util.js';

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

      const totals: DynamicProductFields = sumNumericFields(summary.rows, [
        'groupId',
        'groupName',
      ]);

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
          // FIX H1 (round 2 review): see purchase.builder.ts — key by
          // distributor+category+field so the same product in two
          // distributors' grids doesn't collide.
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
