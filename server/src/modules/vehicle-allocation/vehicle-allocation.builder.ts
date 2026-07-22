import { Injectable } from '@nestjs/common';
import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';
import { SupplyCategory } from '../../generated/prisma/client.js';
import {
  Vehicle,
  Distributor,
  VehicleAssignment,
  VehicleAllocation,
  DynamicProductFields,
  VehicleAllocationRow,
  VehicleAssignmentRow,
  VehicleAssignmentGrid,
  AllocationGrid,
  AllocationGridResult,
  Product,
} from '../../types/vehicle-allocation.types.js';

import { AllocationSummary } from '../../common/builders/allocation-summary.builder.js';

@Injectable()
export class VehicleAllocationBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  private buildVehicleCapacityColumns(
    products: Product[],
    includePackagingType: boolean,
  ): ProductColumnNode[] {
    const columns = this.productColumnsBuilder.buildGroupedColumns(
      products,
      'ordered',
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

      const summaryTotal: DynamicProductFields = {};

      for (const row of summary.rows) {
        for (const [key, value] of Object.entries(row)) {
          if (key === 'groupId' || key === 'groupName') {
            continue;
          }

          summaryTotal[key] = (summaryTotal[key] ?? 0) + Number(value ?? 0);
        }
      }

      allocations.push({
        summaryKey: summary.summaryKey,
        distributorId: summary.distributorId,
        category: summary.category,
        brandId: summary.brandId,
        brandName: summary.brandName,
        summaryTotal,
        columns,
        rows,
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
          g.distributorId === allocation.distributor_id &&
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

  buildVehicleAssignmentGrid(
    vehicles: Vehicle[],
    distributors: Distributor[],
  ): VehicleAssignmentGrid {
    return {
      assignments: vehicles.map((vehicle) => ({
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicle_name,
        milkDistributorId: null,
        nonMilkDistributorId: null,
      })),
      distributors: distributors.map((distributor) => ({
        id: distributor.id,
        name: distributor.name,
      })),
    };
  }

  applyVehicleAssignments(
    assignmentGrid: VehicleAssignmentGrid,
    savedAssignments: VehicleAssignment[],
  ) {
    const result = structuredClone(assignmentGrid);

    for (const assignment of savedAssignments) {
      const row = result.assignments.find(
        (vehicle: VehicleAssignmentRow) =>
          vehicle.vehicleId === assignment.vehicle_id,
      );

      if (!row) {
        continue;
      }

      if (assignment.category === SupplyCategory.MILK) {
        row.milkDistributorId = assignment.distributor_id;
      }

      if (assignment.category === SupplyCategory.NON_MILK) {
        row.nonMilkDistributorId = assignment.distributor_id;
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
