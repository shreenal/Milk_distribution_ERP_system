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
} from './order-item.types.js';

export type VehicleAllocation = Prisma.vehicle_allocationGetPayload<{
  include: {
    master_vehicle: true;

    distributor: true;

    vehicle_allocation_paper: {
      select: {
        delivery_session: true;
      };
    };

    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
        master_product_type: true;
        master_packaging_type: true;
        product_order_unit: {
          select: {
            units_per_order_unit: true;
            pricing_quantity: true;
            pricing_unit: true;
          };
        };
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
  [key: string]:
    | string
    | number
    | null
    | boolean
    | PurchaseVarianceMetadata
    | PurchaseCellMeta;
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

  // PD-45: estimated (unsaved defaults) and persisted (saved) are never merged.
  totals: PurchaseTotals;
};

export type PurchaseTotals = {
  estimatedTotalAmount: number;
  persistedTotalAmount: number;
};

export type PurchaseGrid = {
  purchases: PurchaseGridItem[];
};

export type PurchaseRateDefault = {
  distributorId: number;
  category: SupplyCategory;
  vehicleId: number;
  productId: number;
  // PD-48: a missing rate or configuration is reported per cell, not thrown.
  purchaseRate: number | null;
  pricingQuantity: number | null;
  deliverySession: DeliverySession;
  rateStatus: PurchaseRateStatus;
  rateIssue?: 'NO_ACTIVE_LINK' | 'NO_RATE' | 'NO_ORDER_UNIT';
};

export type PurchaseRateStatus = 'OK' | 'MISSING_CONFIGURATION';

/** PD-22 / PD-39 / PD-4: per-cell metadata the frontend needs. */
export type PurchaseCellMeta = {
  entryId: number | null;
  /** true once a purchase decision (including an explicit 0) is saved */
  tracked: boolean;
  /** PD-22: FROZEN for saved entries, LIVE for pre-filled defaults */
  rateType: 'FROZEN' | 'LIVE';
  rateStatus: PurchaseRateStatus;
  rateIssue: string | null;
  /** the CURRENT allocation: echo these on save (PD-4) */
  sourceAllocationId: number | null;
  sourceAllocatedQty: number | null;
  /** the allocation the saved entry was made against */
  snapshotAllocationId: number | null;
  snapshotAllocatedQty: number | null;
};

export enum PurchaseVarianceSeverity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PurchaseVarianceStatus {
  MATCHED = 'MATCHED',
  SHORTFALL = 'SHORTFALL',
  SURPLUS = 'SURPLUS',
  UNPLANNED_ALLOCATION = 'UNPLANNED_ALLOCATION',
}

export type PurchaseVarianceMetadata = {
  allocatedQty: number;
  purchasedQty: number;
  hasVariance: boolean;
  variance: number;
  variancePercentage: number | null;
  signedVariancePercentage: number | null;
  fulfillmentPercentage: number | null;
  status: PurchaseVarianceStatus;
  severity: PurchaseVarianceSeverity;
  shortfallWarning: boolean;
};
