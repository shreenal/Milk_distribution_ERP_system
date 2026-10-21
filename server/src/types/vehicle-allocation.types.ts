// src/types/vehicle-capacity.types.ts

import { ProductColumnNode } from '../common/builders/product-columns.builder.js';
export type {
  OrderItemWithSupplyContext,
  Product,
} from './order-item.types.js';
import {
  Prisma,
  SupplyCategory,
  VehicleAllocationAnomalyReason,
} from '../generated/prisma/client.js';

export type Vehicle = {
  id: number;
  vehicle_name: string | null;
};

export type VehicleAllocation = {
  vehicle_id: number;
  distributor_id: number;
  category: SupplyCategory;
  product_id: number;
  allocated_qty: Prisma.Decimal;
};

export type DynamicProductFields = Record<string, number>;

export type VehicleAllocationRow = {
  vehicleId: number;
  vehicleName: string | null;
  [key: string]: string | number | null;
};

export type AllocationGrid = {
  distributor: {
    id: number;
    name: string;
  };

  category: SupplyCategory;

  brand: {
    id: number;
    name: string;
  };

  totals: DynamicProductFields;
  columns: ProductColumnNode[];
  rows: VehicleAllocationRow[];
};

export type AllocationGridResult = {
  allocations: AllocationGrid[];
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

// ---------------------------------------------------------------------------
// Added for the stale / anomaly lifecycle (VA-6, VA-7, VA-8)
// ---------------------------------------------------------------------------

const labelledProductInclude = {
  master_brand: true,
  master_product_group: true,
  master_product_type: true,
  master_packaging_type: true,
} as const;

export type StoredAllocation = Prisma.vehicle_allocationGetPayload<{
  include: {
    master_vehicle: true;
    distributor: true;
    master_product: { include: typeof labelledProductInclude };
  };
}>;

export type StoredAnomaly = Prisma.vehicle_allocation_anomalyGetPayload<{
  include: {
    master_vehicle: true;
    distributor: true;
    master_product: { include: typeof labelledProductInclude };
  };
}>;

export type InvalidAllocation = {
  row: StoredAllocation;
  reason: VehicleAllocationAnomalyReason;
};

export type StaleAllocation = {
  row: StoredAllocation;
  requiredAtSave: number;
  currentRequired: number;
};

export type AllocationDetection = {
  invalid: InvalidAllocation[];
  stale: StaleAllocation[];
};

export type AllocationCoverageLine = {
  distributorId: number;
  distributorName: string;
  category: SupplyCategory;
  productId: number;
  productName: string;
  field: string;
  requiredQty: number;
  allocatedQty: number;
  isComplete: boolean;
};

export type StaleAllocationView = {
  kind: 'INVALID' | 'REQUIREMENT_CHANGED';
  reason: VehicleAllocationAnomalyReason | 'REQUIREMENT_CHANGED';
  message: string;
  vehicleId: number;
  vehicleName: string;
  distributorId: number;
  distributorName: string;
  category: SupplyCategory;
  productId: number;
  productName: string;
  allocatedQty: number;
};

export type AllocationAnomalyView = {
  id: number;
  reason: VehicleAllocationAnomalyReason;
  message: string;
  vehicleId: number;
  vehicleName: string;
  distributorId: number;
  distributorName: string;
  category: SupplyCategory;
  productId: number;
  productName: string;
  removedQty: number;
  flaggedAt: Date;
};
