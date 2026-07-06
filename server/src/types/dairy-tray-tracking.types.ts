import {Prisma} from '../generated/prisma/client.js'


export type Vehicle = Prisma.master_vehicleGetPayload<{}>;

export type BuildDairyTrayGridParams = {
  vehicles: Vehicle[];
  trayTypes: TrayType[];
  vehicleAllocations: VehicleAllocation[];
  trayRules: ProductTrayRule[];
  previousTransactions: DairyTrayTransaction[];
  currentTransactions: DairyTrayTransaction[];
};

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
        master_product_type: true;
        master_packaging_type: true;
      };
    };
  };
}>;

export type ProductTrayRule = Prisma.product_tray_ruleGetPayload<{
  include: {
    master_tray_type: {
      include: {
        master_brand: true;
      };
    };
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type DairyTrayGrid = {
  columns: TrayColumnNode[];
  rows: DairyTrayRow[];
  totals: DairyTrayTotals;
};


export type TrayType = Prisma.master_tray_typeGetPayload<{
  include: {
    master_brand: true;
  };
}>;

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
  [key: string]: string | number | null;
};

export type TrayTotal = {
  opening: number;
  taken: number;
  returned: number;
  closing: number;
};

export type DairyTrayTotals = {
  totalVehicles: number;
  [key: string]: number | TrayTotal;
};

export type TrayColumnNode = {
  headerName: string;
  field?: string;
  editable?: boolean;
  pinned?: string;
  children?: TrayColumnNode[];
};