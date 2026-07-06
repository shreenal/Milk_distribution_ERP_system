import { Injectable } from '@nestjs/common';
import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';
import { SupplyCategory } from '../../generated/prisma/client.js';
import {Product, Vehicle, Distributor, VehicleAssignment, VehicleAllocation, DynamicProductFields, VehicleAllocationRow, VehicleAssignmentRow, VehicleAssignmentGrid, AllocationGrid, AllocationGridResult, SummaryRow, Summary, OrderItemWithSupplyContext} from '../../types/vehicle-allocation.types.js';


@Injectable()
export class VehicleAllocationBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildGroupSummary(orderItems: OrderItemWithSupplyContext[]) {
    type SummaryBuilder = Summary & {
      products: Product[];
    };

    const summariesMap = new Map<string, SummaryBuilder>();

    for (const item of orderItems) {
      const product = item.master_product;

      const brandId = product.master_brand.id;
      const brandName = product.master_brand.name;
      const productGroupId = product.master_product_group.id;
      const productGroupName = product.master_product_group.name;

      const summaryKey = `${item.distributorId}_${item.category}_${brandId}_${productGroupId}`;

      let summary = summariesMap.get(summaryKey);

      if (!summary) {
        summary = {
          summaryKey,
          distributorId: item.distributorId,
          category: item.category,
          brandId,
          brandName,
          productGroupId,
          productGroupName,
          columns: [],
          rows: [],
          products: [],
        };

        summariesMap.set(summaryKey, summary);
      }

      if (!summary.products.some((p) => p.id === product.id)) {
        summary.products.push(product);
      }

      let row = summary.rows.find((r) => r.groupId === item.groupId);

      if (!row) {
        row = {
          groupId: item.groupId,
          groupName: item.groupName,
        };
        summary.rows.push(row);
      }

      const field = `product_${item.productId}`;
      const currentValue = typeof row[field] === 'number' ? row[field] : 0;
      row[field] = currentValue + Number(item.orderedQty ?? 0);
    }

    const summaries: Summary[] = [];

    for (const summary of summariesMap.values()) {
      summaries.push({
        summaryKey: summary.summaryKey,
        distributorId: summary.distributorId,
        category: summary.category,
        brandId: summary.brandId,
        brandName: summary.brandName,
        productGroupId: summary.productGroupId,
        productGroupName: summary.productGroupName,
        columns: this.buildVehicleCapacityColumns(
          summary.products,
          summary.category === SupplyCategory.NON_MILK,
        ),
        rows: summary.rows,
      });
    }

    return { summaries };
  }

  private buildVehicleCapacityColumns(
    products: Product[],
    includePackagingType: boolean,
  ): ProductColumnNode[] {
    const columns = this.productColumnsBuilder.buildGroupedColumns(
      products,
      'night',
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
    summaries: Summary[],
    vehicles: Vehicle[],
  ): AllocationGridResult {
    const allocations: AllocationGrid[] = [];

    for (const summary of summaries) {
      const rows: VehicleAllocationRow[] = [];

      const productFields = initializeProductFields(summary.columns);

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
        productGroupId: summary.productGroupId,
        productGroupName: summary.productGroupName,
        summaryTotal,
        columns: summary.columns,
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
