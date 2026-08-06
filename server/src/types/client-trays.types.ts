import { Prisma } from '../generated/prisma/client.js';
import type {
  ProductTrayRule,
  TrayRuleProduct,
  TrayType,
} from './tray.types.js';

export type TrayClient = Prisma.master_clientGetPayload<{}>;

export type ClientTraySheetItem = Prisma.order_sheet_itemsGetPayload<{
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

export type ClientTrayGrid = {
  columns: ClientTrayColumnNode[];
  rows: ClientTrayRow[];
  totals: ClientTrayTotals;
};

export interface TrayTransactionFields {
  opening_balance: number;
  trays_taken: number;
  trays_returned: number;
  closing_balance: number;
}

// export type ProductTrayRule = Prisma.product_tray_ruleGetPayload<{
//   include: {
//     master_tray_type: {
//       include: {
//         master_brand: true;
//       };
//     };
//     master_brand: true;
//     master_product_group: true;
//     master_product_type: true;
//     master_packaging_type: true;
//   };
// }>;

export type ClientTrayType = Prisma.master_tray_typeGetPayload<{
  include: {
    master_brand: true;
  };
}>;

export type ClientTrayTransaction = Prisma.client_tray_transactionGetPayload<{
  include: {
    master_client: true;
    master_tray_type: {
      include: {
        master_brand: true;
      };
    };
  };
}>;

export type ClientTrayRow = {
  clientId: number;
  clientName: string;
  [key: string]: string | number;
};

export type ClientTrayTotal = {
  opening: number;
  taken: number;
  returned: number;
  closing: number;
};

export type ClientTrayTotals = {
  totalClients: number;
  [key: string]: number | ClientTrayTotal;
};

export type ClientTrayColumnNode = {
  headerName: string;
  field?: string;
  editable?: boolean;
  pinned?: string;
  children?: ClientTrayColumnNode[];
};
