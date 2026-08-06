import { Injectable } from '@nestjs/common';
import {
  DenominationRow,
  DenominationTotals,
  RouteCashSheet,
} from '../../types/cash-settlement.types.js';
import {
  BankDepositRowDto,
  DirectCollectionRowDto,
  RouteSettlementRowDto,
} from '../../modules/transactions/cash-settlement/dto/cash-settlement-response.dto.js';
@Injectable()
export class CashSettlementCalculationService {
  getDenominationTotals(rows: DenominationRow[]): DenominationTotals {
    return rows.reduce<DenominationTotals>(
      (totals, row) => {
        totals.note2000 += Number(row.note_2000 ?? 0);

        totals.note500 += Number(row.note_500 ?? 0);

        totals.note200 += Number(row.note_200 ?? 0);

        totals.note100 += Number(row.note_100 ?? 0);

        totals.note50 += Number(row.note_50 ?? 0);

        totals.note20 += Number(row.note_20 ?? 0);

        totals.note10 += Number(row.note_10 ?? 0);

        totals.coins += Number(row.coins ?? 0);

        return totals;
      },
      {
        note2000: 0,
        note500: 0,
        note200: 0,
        note100: 0,
        note50: 0,
        note20: 0,
        note10: 0,
        coins: 0,
      },
    );
  }

  getDenominationAmount(totals: DenominationTotals): number {
    return (
      totals.note2000 * 2000 +
      totals.note500 * 500 +
      totals.note200 * 200 +
      totals.note100 * 100 +
      totals.note50 * 50 +
      totals.note20 * 20 +
      totals.note10 * 10 +
      totals.coins
    );
  }

  getDenominationAmountFromRow(row: DenominationRow | null): number {
    return (
      Number(row?.note_2000 ?? 0) * 2000 +
      Number(row?.note_500 ?? 0) * 500 +
      Number(row?.note_200 ?? 0) * 200 +
      Number(row?.note_100 ?? 0) * 100 +
      Number(row?.note_50 ?? 0) * 50 +
      Number(row?.note_20 ?? 0) * 20 +
      Number(row?.note_10 ?? 0) * 10 +
      Number(row?.coins ?? 0)
    );
  }

  getRouteCash(sheet: RouteCashSheet): number {
    return sheet.client_collection.reduce(
      (sum, collection) =>
        sum +
        Number(collection.office_amount_given) +
        Number(collection.cash_collection),
      0,
    );
  }

  getRouteExpenseTotal(sheet: RouteCashSheet): number {
    return (
      sheet.cash_route_settlement?.expenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0,
      ) ?? 0
    );
  }

  getRouteNetCash(sheet: RouteCashSheet): number {
    return this.getRouteCash(sheet) - this.getRouteExpenseTotal(sheet);
  }

  mergeDenominationTotals(
    first: DenominationTotals,
    second: DenominationTotals,
  ): DenominationTotals {
    return {
      note2000: first.note2000 + second.note2000,
      note500: first.note500 + second.note500,
      note200: first.note200 + second.note200,
      note100: first.note100 + second.note100,
      note50: first.note50 + second.note50,
      note20: first.note20 + second.note20,
      note10: first.note10 + second.note10,
      coins: first.coins + second.coins,
    };
  }

  getOfficeCash(
    totalRouteNetCash: number,
    totalDirectCollections: number,
  ): number {
    return totalRouteNetCash + totalDirectCollections;
  }

  getTotalRouteNetCash(sheets: RouteCashSheet[]): number {
    return sheets.reduce(
      (total, sheet) => total + this.getRouteNetCash(sheet),
      0,
    );
  }

  getTotalRouteCash(rows: RouteSettlementRowDto[]): number {
    return rows.reduce((sum, row) => sum + row.routeCash, 0);
  }

  getTotalRouteExpenses(rows: RouteSettlementRowDto[]): number {
    return rows.reduce((sum, row) => sum + row.expenseTotal, 0);
  }

  getTotalRouteNetCashFromSettlements(rows: RouteSettlementRowDto[]): number {
    return rows.reduce((sum, row) => sum + row.routeNetCash, 0);
  }

  getTotalRouteDenominationCash(rows: RouteSettlementRowDto[]): number {
    return rows.reduce((sum, row) => sum + row.denominationTotal, 0);
  }

  getTotalDirectCollectionCash(rows: DirectCollectionRowDto[]): number {
    return rows.reduce((sum, row) => sum + row.collectionAmount, 0);
  }

  getTotalDeposits(rows: BankDepositRowDto[]): number {
    return rows.reduce((sum, row) => sum + row.depositAmount, 0);
  }

  getRevisedOfficeCash(
    totalRouteNetCash: number,
    historicalDirectCollectionCash: number,
  ): number {
    return totalRouteNetCash + historicalDirectCollectionCash;
  }

  getHistoricalCashOnHand(
    historicalRouteDenominationCash: number,
    historicalDirectCollectionCash: number,
    totalDeposits: number,
  ): number {
    return (
      historicalRouteDenominationCash +
      historicalDirectCollectionCash -
      totalDeposits
    );
  }

  getReconciliationDifference(
    revisedOfficeCash: number,
    historicalCashOnHand: number,
  ): number {
    return revisedOfficeCash - historicalCashOnHand;
  }

  getCashInHandAfterDeposits(
    officeCash: number,
    totalDeposits: number,
  ): number {
    return officeCash - totalDeposits;
  }
}
