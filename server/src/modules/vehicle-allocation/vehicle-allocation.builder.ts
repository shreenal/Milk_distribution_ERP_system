import { Injectable } from '@nestjs/common';
import {
  ProductColumnsBuilder,
  ProductColumnNode,
} from '../../common/builders/product-columns.builder.js';
import { Prisma } from '../../generated/prisma/client.js';

type OrderSheet = Prisma.order_sheetGetPayload<{
  include: {
    master_group: true;
  };
}>;

type SheetItem = Prisma.order_sheet_itemsGetPayload<{
  include: {
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
        master_product_type: true;
        master_packaging_type: true;
      };
    };
  };
}>;

type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

type Vehicle = Prisma.master_vehicleGetPayload<{}>;

type Distributor = Prisma.master_distributorGetPayload<{}>;

type VehicleAssignment = Prisma.vehicle_distribution_assignmentGetPayload<{}>;

type VehicleAllocation = Prisma.vehicle_allocationGetPayload<{}>;

type DynamicProductFields = Record<string, number>;

type VehicleAllocationRow = {
  vehicleId: number;
  vehicleName: string | null;
  [key: string]: string | number | null;
};

type VehicleAssignmentRow = {
  vehicleId: number;
  vehicleName: string | null;
  distributorId: number | null;
};

type VehicleAssignmentGrid = {
  assignments: VehicleAssignmentRow[];
  distributors: {
    id: number;
    name: string;
  }[];
};

type AllocationGrid = {
  summaryKey: string;
  brandId: number;
  brandName: string;
  productGroupId: number;
  productGroupName: string;
  summaryTotal: DynamicProductFields;
  columns: ProductColumnNode[];
  rows: VehicleAllocationRow[];
};

type AllocationGridResult = {
  allocations: AllocationGrid[];
};

type SummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};

type Summary = {
  summaryKey: string;
  brandId: number;
  brandName: string;
  productGroupId: number;
  productGroupName: string;
  columns: ProductColumnNode[];
  rows: SummaryRow[];
};

@Injectable()
export class VehicleAllocationBuilder {
  constructor(private readonly productColumnsBuilder: ProductColumnsBuilder) {}

  buildGroupSummary(
    sheets: OrderSheet[],
    sheetItems: SheetItem[],
    products: Product[],
  ) {
    type SummaryBuilder = Summary & {
      products: Product[];
    };
    const summariesMap = new Map<string, SummaryBuilder>();

    for (const product of products) {
      const key = `${product.master_brand.id}_${product.master_product_group.id}`;

      if (!summariesMap.has(key)) {
        summariesMap.set(key, {
          summaryKey: key,
          brandId: product.master_brand.id,
          brandName: product.master_brand.name,
          productGroupId: product.master_product_group.id,
          productGroupName: product.master_product_group.name,
          products: [],
          rows: [],
          columns: [],
        });
      }

      const summary = summariesMap.get(key);
      if (!summary) {
        continue;
      }
      summary.products.push(product);
    }

    for (const sheet of sheets) {
      const summaryRowsMap = new Map<string, SummaryRow>();

      for (const [key] of summariesMap) {
        summaryRowsMap.set(key, {
          groupId: sheet.group_id,
          groupName: sheet.master_group.name,
        });
      }

      const currentSheetItems = sheetItems.filter(
        (item) => item.order_sheet_id === sheet.id,
      );

      for (const item of currentSheetItems) {
        const key = `${item.master_product.master_brand.id}_${item.master_product.master_product_group.id}`;

        const row = summaryRowsMap.get(key);

        if (!row) {
          continue;
        }

        const field = `product_${item.product_id}`;

        const currentValue = typeof row[field] === 'number' ? row[field] : 0;

        row[field] = currentValue + Number(item.ordered_qty ?? 0);
      }

      for (const [key, row] of summaryRowsMap) {
        const summary = summariesMap.get(key);

        if (!summary) {
          continue;
        }

        summary.rows.push(row);
      }
    }

    const summaries: Summary[] = [];

    for (const summary of summariesMap.values()) {
      summaries.push({
        summaryKey: summary.summaryKey,
        brandId: summary.brandId,
        brandName: summary.brandName,
        productGroupId: summary.productGroupId,
        productGroupName: summary.productGroupName,
        columns: this.buildVehicleCapacityColumns(
          summary.products,
          summary.productGroupName !== 'Milk',
        ),
        rows: summary.rows,
      });
    }

    return {
      summaries,
    };
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

      for (const grid of result.allocations) {
        const row = grid.rows.find(
          (vehicle) => vehicle.vehicleId === allocation.vehicle_id,
        );

        if (row && field in row) {
          row[field] = Number(allocation.allocated_qty);

          break;
        }
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

        distributorId: null,
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

      if (row) {
        row.distributorId = assignment.distributor_id;
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
