import {
  Prisma,
  SupplyCategory,
  DeliverySession,
} from '../generated/prisma/client.js';

// FIX F19 (consistency review): these were previously defined inside
// common/builders/allocation-summary.builder.ts and re-exported by
// vehicle-allocation.types.ts / purchase.types.ts, which inverted the usual
// dependency direction (builders should depend on types, not the reverse).
// Canonical definitions now live here; builders import from this file.

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
  // FIX F6 (consistency review): distributor name is now captured alongside
  // distributorId so Vehicle Allocation can display it the same way Purchase
  // already does (see order-items.repository.ts / allocation-summary.builder.ts).
  distributorName: string;
  deliverySession: DeliverySession;
  category: SupplyCategory;
  master_product: Product;
};

export type SummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};
