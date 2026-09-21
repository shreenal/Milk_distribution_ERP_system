import { Prisma } from '../generated/prisma/client.js';

export interface CollectionRow {
  collectionId;

  clientId;

  clientCode;

  clientName;

  cashCollection;

  officeAmountGiven;

  chequeCollection;

  onlineCollection;

  bankDeposit;

  employeeRemarks;

  adminRemarks;

  employeeTotal;

  adminTotal;

  grandTotal;
}

export interface CollectionTotals {
  cashCollection: number;

  officeAmountGiven: number;

  chequeCollection: number;

  onlineCollection: number;

  bankDeposit: number;

  employeeTotal: number;

  adminTotal: number;

  grandTotal: number;
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

export type CollectionGrid = {
  columns: any[];
  rows: any[];
  totals: {
    totalClients: number;
    cashCollection: number;
    officeAmountGiven: number;
    chequeCollection: number;
    onlineCollection: number;
    bankDeposit: number;
    employeeTotal: number;
    adminTotal: number;
    grandTotal: number;
  };
};

export type SavedCollection = Prisma.client_collectionGetPayload<{
  select: {
    id: true;
    client_id: true;
    category: true;
    cash_collection: true;
    office_amount_given: true;
    cheque_collection: true;
    online_collection: true;
    bank_deposit: true;
    employee_remarks: true;
    admin_remarks: true;
  };
}>;
