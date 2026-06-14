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

export interface CollectionGrid {
  orderSheetId: number;

  groupId: number;

  groupName: string;

  paperStatus: string;

  rows: CollectionRow[];

  totals: CollectionTotals;
}
