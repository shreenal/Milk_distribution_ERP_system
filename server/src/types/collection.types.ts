import { Prisma } from '../generated/prisma/client.js';

// Admin-side fields are optional: they are projected away for non-admin
// callers (CD-3.8), so they are simply absent from the payload.
export interface CollectionRow {
  collectionId: number | null;

  clientId: number;

  clientCode: string | null;

  clientName: string;

  officeCashCollection: number;

  cashCollection: number;

  chequeCollection: number;

  employeeTotal: number;

  onlineCollection?: number;

  bankDeposit?: number;

  adminTotal?: number;

  grandTotal?: number;
}

export interface CollectionTotals {
  totalClients: number;

  officeCashCollection: number;

  cashCollection: number;

  chequeCollection: number;

  employeeTotal: number;

  onlineCollection?: number;

  bankDeposit?: number;

  adminTotal?: number;

  grandTotal?: number;
}

export type CollectionSheet = Prisma.order_sheetGetPayload<{
  include: {
    master_group: true;
    order_paper: true;
  };
}>;

export type CollectionClient = {
  id: number;
  code: string | null;
  name: string;
};

export type CollectionColumnNode = {
  field?: string;
  headerName: string;
  editable?: boolean;
  children?: CollectionColumnNode[];
};

export type CollectionGrid = {
  columns: CollectionColumnNode[];
  rows: CollectionRow[];
  totals: CollectionTotals;
};

export type SavedCollection = Prisma.client_collectionGetPayload<{
  select: {
    id: true;
    client_id: true;
    category: true;
    cash_collection: true;
    office_cash_collection: true;
    cheque_collection: true;
    online_collection: true;
    bank_deposit: true;
  };
}>;
