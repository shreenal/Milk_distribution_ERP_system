import {Prisma, SupplyCategory } from '../generated/prisma/client.js';
import { ProductColumnNode} from '../common/builders/product-columns.builder.js';

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type VehicleAllocation = Prisma.vehicle_allocationGetPayload<{
  include: {
    master_vehicle: true;
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
      };
    };
  };
}>;

export type PurchaseEntry = Prisma.purchase_entryGetPayload<{}>;

export type PurchaseRow = {
  vehicleId: number;
  vehicleName: string | null;
  [key: string]: string | number | null;
};

export type PurchaseGridItem = {
  purchaseKey: string;
  distributorId: number;
  distributorName: string;
  category: SupplyCategory;
  brandId: number;
  brandName: string;
  productGroupId: number;
  productGroupName: string;
  columns: ProductColumnNode[];
  rows: PurchaseRow[];
};

export type PurchaseGrid = {
  purchases: PurchaseGridItem[];
};

export type PurchaseRateDefault = {
  distributorId: number;
  category: SupplyCategory;
  vehicleId: number;
  productId: number;
  purchaseRate: number;
};

export type VehicleAssignment = {
  vehicle_id: number;
  distributor_id: number;
  category: SupplyCategory;
  master_vehicle: {
    id: number;
    vehicle_name: string | null;
  };
  master_distributor: {
    id: number;
    name: string;
  };
};

export interface ProcurementRule {
  distributor_id: number;
  brand_id: number;
  product_group_id: number;
  master_distributor: { name: string };
  master_brand: { name: string };
  master_product_group: { name: string };
  category: SupplyCategory;
}
