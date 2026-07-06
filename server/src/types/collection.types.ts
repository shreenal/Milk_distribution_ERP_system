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

export type CollectionClient = Prisma.master_clientGetPayload<{}>;

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

export type SavedCollection = Prisma.client_collectionGetPayload<{}>;