import { DeliverySession } from '../../../generated/prisma/client.js';
import { DairyTrayKey } from '../../../types/dairy-trays.types.js';

// Same key shape TrayCalculationService.buildDairyTakenByKey already produces.
// The session (NIGHT / MORNING) contains no underscore, so splitting is safe.
export function buildDairyTrayKey(key: DairyTrayKey): string {
  return `${key.vehicleId}_${key.deliverySession}_${key.trayTypeId}`;
}

export function parseDairyTrayKey(key: string): DairyTrayKey {
  const [vehicleId, deliverySession, trayTypeId] = key.split('_');
  return {
    vehicleId: Number(vehicleId),
    deliverySession: deliverySession as DeliverySession,
    trayTypeId: Number(trayTypeId),
  };
}

/** Messages use names, never raw ids (unless the entity is unknown). */
export function describeVehicle(vehicle: {
  vehicle_name: string | null;
  vehicle_number: string;
}): string {
  return vehicle.vehicle_name ?? vehicle.vehicle_number;
}

export function describeTrayType(trayType: {
  color: string;
  master_brand: { name: string };
}): string {
  return `${trayType.master_brand.name} ${trayType.color} tray`;
}
