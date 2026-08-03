import {
  DeliverySession,
  Prisma,
  SupplyCategory,
  PurchaseVarianceReason,
} from '../generated/prisma/client.js';
import { ProductColumnNode } from '../common/builders/product-columns.builder.js';

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type OrderItemWithSupplyContext = {
  groupId: number;
  groupName: string;
  productId: number;
  orderedQty: number;
  distributorId: number;
  category: SupplyCategory;
  master_product: Product;
};

export type SummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};

export type VehicleAllocation = Prisma.vehicle_allocationGetPayload<{
  include: {
    master_vehicle: true;
    vehicle_allocation_paper: {
      select: {
        delivery_session: true;
      };
    };
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
  deliverySession: DeliverySession;
  [key: string]:
  | string
  | number
  | null
  | PurchaseVarianceMetadata;
};

export type PurchaseGridItem = {
  distributor: {
    id: number;
    name: string;
  };

  category: SupplyCategory;

  brand: {
    id: number;
    name: string;
  };

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
  deliverySession: DeliverySession;
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
  vehicle_allocation_paper: {
    delivery_session: DeliverySession;
  };
};

export type PurchaseVarianceAcknowledgement =
  Prisma.purchase_variance_acknowledgementGetPayload<{
    include: {
      purchase_entry: {
        select: {
          id: true;
          distributor_id: true;
          category: true;
          vehicle_id: true;
          product_id: true;
          delivery_session: true;
        };
      };
      user: {
        select: {
          id: true;
          username: true;
          first_name: true;
          last_name: true;
        };
      };
    };
  }>;

export enum PurchaseVarianceSeverity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export type PurchaseVarianceMetadata = {
  allocatedQty: number;
  purchasedQty: number;

  hasVariance: boolean;
  variance: number;
  variancePercentage: number;
  severity: PurchaseVarianceSeverity;

  acknowledgement: PurchaseVarianceAcknowledgement | null;
};