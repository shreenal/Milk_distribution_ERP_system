// src/types/vehicle-capacity.types.ts

import { ProductColumnNode } from 'src/common/builders/product-columns.builder.js';
import { Prisma, SupplyCategory } from '../generated/prisma/client.js';

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type Vehicle = Prisma.master_vehicleGetPayload<{}>;

export type Distributor = Prisma.master_distributorGetPayload<{}>;

export type VehicleAssignment =
  Prisma.vehicle_distribution_assignmentGetPayload<{}>;

export type VehicleAllocation = Prisma.vehicle_allocationGetPayload<{}>;

export type DynamicProductFields = Record<string, number>;

export type VehicleAllocationRow = {
  vehicleId: number;
  vehicleName: string | null;
  [key: string]: string | number | null;
};

export type VehicleAssignmentRow = {
  vehicleId: number;
  vehicleName: string | null;
  milkDistributorId: number | null;
  nonMilkDistributorId: number | null;
};

export type VehicleAssignmentGrid = {
  assignments: VehicleAssignmentRow[];
  distributors: {
    id: number;
    name: string;
  }[];
};

export type AllocationGrid = {
  summaryKey: string;
  distributorId: number;
  category: SupplyCategory;
  brandId: number;
  brandName: string;
  summaryTotal: DynamicProductFields;
  columns: ProductColumnNode[];
  rows: VehicleAllocationRow[];
};

export type AllocationGridResult = {
  allocations: AllocationGrid[];
};

export type OrderItemWithSupplyContext = {
  groupId: number;
  groupName: string;
  productId: number;
  orderedQty: number;
  distributorId: number;
  category: SupplyCategory;
  master_product: Product;
};

export interface VehicleCapacityColumn {
  productId: number;
  brandId: number;
  brandName: string;

  productGroupId: number;
  productGroupName: string;

  productTypeId: number;
  productTypeName: string;

  packagingTypeId: number;
  packagingTypeName: string;

  packagingSize: number;
  packagingUnit: string;

  columnKey: string;
}

export type VehicleAllocationOrderItem = {
  sheetId: number;
  groupId: number;
  groupName: string;

  distributorId: number;
  distributorName: string;

  category: SupplyCategory;

  productId: number;
  orderedQty: number | null;

  master_product: {
    id: number;
    master_brand: {
      id: number;
      name: string;
    };
    master_product_group: {
      id: number;
      name: string;
    };
    master_product_type: {
      id: number;
      name: string;
    };
    master_packaging_type: {
      id: number;
      name: string;
    } | null;
  };
};

export interface VehicleCapacitySection {
  brandId: number;
  brandName: string;

  productGroupId: number;
  productGroupName: string;

  columns: VehicleCapacityColumn[];

  rows: VehicleCapacityRow[];

  totals: Record<string, number>;
}

export interface VehicleCapacityRow {
  groupId: number;
  groupName: string;

  values: Record<string, number>;
}

export interface VehicleCapacityResponse {
  paperId: number;

  sections: VehicleCapacitySection[];
}

// export interface VehicleAllocationRow {
//   vehicleId: number;

//   vehicleNumber: string;

//   values: Record<string, number>;
// }

export interface VehicleAllocationSection {
  brandId: number;

  brandName: string;

  productGroupId: number;

  productGroupName: string;

  columns: VehicleCapacityColumn[];

  requiredTotals: Record<string, number>;

  rows: VehicleAllocationRow[];
}

export interface VehicleAllocationResponse {
  paperId: number;

  sections: VehicleAllocationSection[];
}
