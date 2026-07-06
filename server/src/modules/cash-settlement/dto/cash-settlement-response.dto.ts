export class CashSettlementResponseDto {
  paperStatus!: string;
  routeSettlements: RouteSettlementRowDto[] = [];

  routeExpenses: RouteExpenseRowDto[] = [];

  routeDenominations: RouteDenominationRowDto[] = [];

  directCollections: DirectCollectionRowDto[] = [];

  bankDeposits: BankDepositRowDto[] = [];

  summary!: CashSummaryDto;
}

export interface RouteSettlementRowDto {
  sheetId: number;
  routeName: string;

  routeCash: number;
  expenseTotal: number;
  routeNetCash: number;

  denominationTotal: number;
  difference: number;
}

export interface RouteDenominationRowDto {
  sheetId: number;
  routeName: string;

  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;

  coins: number;

  denominationTotal: number;
}

export interface DirectCollectionRowDto {
  id: number;

  employeeId: number;
  employeeName: string;

  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;

  coins: number;

  collectionAmount: number;
}

export interface CashSummaryBaseDto {
  totalRouteCash: number;
  totalRouteExpenses: number;
  totalRouteNetCash: number;
  totalDeposits: number;
}

export interface CashSummaryInitialDto extends CashSummaryBaseDto {
  directCollectionCash: number;
  officeCash: number;
  cashInHandAfterDeposits: number;
}

export interface CashSummaryReopenedDto extends CashSummaryBaseDto {
  historicalRouteDenominationCash: number;
  historicalDirectCollectionCash: number;
  revisedOfficeCash: number;
  historicalCashOnHand: number;
  reconciliationDifference: number;
}

export type CashSummaryDto = CashSummaryInitialDto | CashSummaryReopenedDto;

export interface BankDepositRowDto {
  id: number;

  bankId: number;
  bankName: string;

  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;

  coins: number;

  depositAmount: number;
}

export interface RouteExpenseRowDto {
  id: number;

  sheetId: number;
  routeName: string;

  expenseTypeId: number;
  expenseTypeName: string;

  amount: number;
}
