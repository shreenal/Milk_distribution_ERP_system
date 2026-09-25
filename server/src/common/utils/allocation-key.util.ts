import {
  DeliverySession,
  SupplyCategory,
} from '../../generated/prisma/client.js';

/**
 * FIX F1 (consistency review): canonical identity key for a vehicle_allocation
 * row. Previously this composition (`vehicleId_distributorId_category_productId`)
 * was hand-written separately in:
 *   - vehicle-allocation.repository.ts (`keyOf` inside replaceVehicleAllocations)
 * Kept as a single function so every caller agrees on field order/composition.
 *
 * Accepts both snake_case (Prisma result) and camelCase (DTO) field names,
 * since callers on either side of the API boundary need to build the same key.
 */
export function buildAllocationKey(row: {
  vehicle_id?: number;
  vehicleId?: number;
  distributor_id?: number;
  distributorId?: number;
  category: SupplyCategory | string;
  product_id?: number;
  productId?: number;
}): string {
  const vehicleId = row.vehicle_id ?? row.vehicleId;
  const distributorId = row.distributor_id ?? row.distributorId;
  const productId = row.product_id ?? row.productId;

  return `${vehicleId}_${distributorId}_${row.category}_${productId}`;
}

/**
 * FIX F1: canonical identity key for a purchase_entry row (an allocation key
 * plus delivery_session, since a purchase_paper spans both sessions).
 * Previously duplicated in:
 *   - purchase.service.ts (`rowKey`)
 *   - purchase.builder.ts (`buildRowKey`)
 *   - purchase.repository.ts (`keyOf` inside replacePurchaseEntries)
 */
export function buildPurchaseKey(row: {
  vehicle_id?: number;
  vehicleId?: number;
  distributor_id?: number;
  distributorId?: number;
  category: SupplyCategory | string;
  product_id?: number;
  productId?: number;
  delivery_session?: DeliverySession;
  deliverySession?: DeliverySession;
}): string {
  const deliverySession = row.delivery_session ?? row.deliverySession;
  return `${buildAllocationKey(row)}_${deliverySession}`;
}
