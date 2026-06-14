// src/types/vehicle-capacity.types.ts

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

export interface VehicleAllocationRow {
  vehicleId: number;

  vehicleNumber: string;

  values: Record<string, number>;
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
