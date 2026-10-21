import { DeliverySession, Prisma } from '../generated/prisma/client.js';
import type { TrayType } from './tray.types.js';

// DT-6.1: a dairy tray ledger line is identified by vehicle + session + tray type.
export type DairyTrayKey = {
  vehicleId: number;
  deliverySession: DeliverySession;
  trayTypeId: number;
};

export interface DairyTrayLedgerLine extends DairyTrayKey {
  opening: number;
  taken: number;
  // DT-4.6: a return that was never entered is 0, never null.
  returned: number;
  closing: number;
}

/** A row whose stored return is higher than opening + taken (DT-6.5). */
export interface DairyReturnConflict extends DairyTrayKey {
  returned: number;
  available: number;
}

export type Vehicle = {
  id: number;
  vehicle_name: string | null;
  vehicle_number: string;
  is_active: boolean;
};

export type BuildDairyTrayGridParams = {
  vehicles: Vehicle[];
  trayTypes: TrayType[];
  ledgerLines: DairyTrayLedgerLine[];
};

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type PurchaseEntry = Prisma.purchase_entryGetPayload<{
  include: {
    master_vehicle: true;
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
        master_product_type: true;
        master_packaging_type: true;
      };
    };
  };
}>;

export type DairyTrayGrid = {
  columns: DairyTrayColumnNode[];
  rows: DairyTrayRow[];
  // DT-3.7: each session is its own ledger, so totals exist per session only.
  sessionTotals: Record<DeliverySession, DairyTrayTotals>;
};

export type DairyTrayTransaction = Prisma.dairy_tray_transactionGetPayload<{
  include: {
    master_vehicle: true;
    master_tray_type: {
      include: {
        master_brand: true;
      };
    };
  };
}>;

export type DairyTrayRow = {
  vehicleId: number;
  vehicleName: string | null;
  deliverySession: DeliverySession;
  // DT-8.2: true for an inactive vehicle (read-only for ordinary employees).
  readOnly: boolean;
  [key: string]: string | number | boolean | null;
};

export type DairyTrayTotal = {
  opening: number;
  trays: number;
  returned: number;
  closing: number;
};

export type DairyTrayTotals = {
  totalVehicles: number;
  [key: string]: number | DairyTrayTotal;
};

export type DairyTrayColumnNode = {
  headerName: string;
  field?: string;
  editable?: boolean;
  pinned?: string;
  children?: DairyTrayColumnNode[];
};
