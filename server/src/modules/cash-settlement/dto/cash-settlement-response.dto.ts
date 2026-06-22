export class CashSettlementResponseDto {

routeSettlements: RouteSettlementRowDto[] = [];

routeExpenses: RouteExpenseRowDto[] = [];

routeDenominations: RouteDenominationRowDto[] = [];

directCollections: DirectCollectionRowDto[] = [];

bankDeposits: BankDepositRowDto[] = [];

  summary: CashSummaryDto = {
    totalRouteCash: 0,
    totalRouteExpenses: 0,
    totalRouteNetCash: 0,

    totalRouteDenominationCash: 0,
    historicalDirectCollectionCash: 0,

    revisedOfficeCash: 0,

    totalDeposits: 0,

    historicalCashOnHand: 0,

    reconciliationDifference: 0,
};
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

export interface CashSummaryDto {
    totalRouteCash: number;
    totalRouteExpenses: number;
    totalRouteNetCash: number;

    totalRouteDenominationCash: number;
    historicalDirectCollectionCash: number;

    revisedOfficeCash: number;

    totalDeposits: number;

    historicalCashOnHand: number;

    reconciliationDifference: number;
}

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