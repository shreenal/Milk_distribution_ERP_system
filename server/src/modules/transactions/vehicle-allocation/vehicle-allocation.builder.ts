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
          // FIX F6 (consistency review): Vehicle Allocation previously
          // returned only the distributor id, forcing the UI to display a
          // raw number (see VehicleAllocationSection.tsx) while Purchase's
          // equivalent response already included a name.
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

    for (const allocation of savedAllocations) {
      const field = `product_${allocation.product_id}`;

      const grid = result.allocations.find(
        (g) =>
          g.distributor.id === allocation.distributor_id &&
          g.category === allocation.category &&
          g.rows.some((row) => field in row),
      );

      if (!grid) {
        continue;
      }

      const row = grid.rows.find(
        (vehicle) => vehicle.vehicleId === allocation.vehicle_id,
      );

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
