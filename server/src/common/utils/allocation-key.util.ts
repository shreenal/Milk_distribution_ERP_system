import {
  DeliverySession,
  SupplyCategory,
} from '../../generated/prisma/client.js';

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
