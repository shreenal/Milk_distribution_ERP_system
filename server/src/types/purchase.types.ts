import {
  DeliverySession,
  Prisma,
  SupplyCategory,
} from '../generated/prisma/client.js';
import { ProductColumnNode } from '../common/builders/product-columns.builder.js';
export type {
  OrderItemWithSupplyContext,
  Product,
  SummaryRow,
} from '../common/builders/allocation-summary.builder.js';

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

export type PurchaseEntry = Prisma.purchase_entryGetPayload<{
  select: {
    product_id: true;
    distributor_id: true;
    category: true;
    vehicle_id: true;
    delivery_session: true;
    purchased_qty: true;
    purchase_rate: true;
    purchase_amount: true;
    source_allocation_id: true;
    source_allocated_qty: true;
  };
}>;

export type PurchaseRow = {
  vehicleId: number;
  vehicleName: string | null;
  deliverySession: DeliverySession;
  [key: string]: string | number | null | PurchaseVarianceMetadata | boolean;
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
  pricingQuantity: number;
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
};
