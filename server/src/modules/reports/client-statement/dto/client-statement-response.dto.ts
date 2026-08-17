export interface ClientStatementRow {
  date: string;

  products: Record<number, number>;

  bill: number;

  cash: number;
  officeAmountGiven: number;
  cheque: number;
  online: number;
  bankDeposit: number;
  totalPaid: number;

  dayBalance: number;
  outstanding: number;
}

export interface ClientStatementProduct {
  productId: number;
  productName: string;
}

export interface ClientStatementTotals {
  products: Record<number, number>;

  bill: number;

  cash: number;
  officeAmountGiven: number;
  cheque: number;
  online: number;
  bankDeposit: number;
  totalPaid: number;

  dayBalance: number;
  outstanding: number;
}

export interface ClientStatementReport {
  client: {
    id: number;
    code: string | null;
    name: string;
    shopName: string | null;
  };

  from: string;
  to: string;

  products: ClientStatementProduct[];

  rows: ClientStatementRow[];

  totals: ClientStatementTotals;
}
