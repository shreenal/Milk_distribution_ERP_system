import { Prisma } from "../generated/prisma/client.js";

export type TrayClient = Prisma.master_clientGetPayload<{}>;

export type TraySheetItem = Prisma.order_sheet_itemsGetPayload<{
  include: {
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
        master_product_type: true;
        master_packaging_type: true;
      };
    };
    master_client: true;
  };
}>;

export type TrayGrid = {
  columns: TrayColumnNode[];
  rows: TrayRow[];
  totals: TrayTotals;
};

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

export type TrayType = Prisma.master_tray_typeGetPayload<{
  include: {
    master_brand: true;
  };
}>;

export type TrayTransaction = Prisma.client_tray_transactionGetPayload<{
  include: {
    master_client: true;
    master_tray_type: {
      include: {
        master_brand: true;
      };
    };
  };
}>;

export type TrayRow = {
  clientId: number;
  clientName: string;
  [key: string]: string | number;
};

export type TrayTotal = {
  opening: number;
  taken: number;
  returned: number;
  closing: number;
};

export type TrayTotals = {
  totalClients: number;
  [key: string]: number | TrayTotal;
};

export type TrayColumnNode = {
  headerName: string;
  field?: string;
  editable?: boolean;
  pinned?: string;
  children?: TrayColumnNode[];
};