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
import { Decimal, toDecimal, toMoney } from '../utils/money.util.js';

@Injectable()
export class CashSettlementCalculationService {
  getDenominationTotals(rows: DenominationRow[]): DenominationTotals {
    const totals = rows.reduce(
      (acc, row) => ({
        note2000: acc.note2000.plus(toDecimal(row.note_2000 ?? 0)),
        note500: acc.note500.plus(toDecimal(row.note_500 ?? 0)),
        note200: acc.note200.plus(toDecimal(row.note_200 ?? 0)),
        note100: acc.note100.plus(toDecimal(row.note_100 ?? 0)),
        note50: acc.note50.plus(toDecimal(row.note_50 ?? 0)),
        note20: acc.note20.plus(toDecimal(row.note_20 ?? 0)),
        note10: acc.note10.plus(toDecimal(row.note_10 ?? 0)),
        coins: acc.coins.plus(toDecimal(row.coins ?? 0)),
      }),
      {
        note2000: new Decimal(0),
        note500: new Decimal(0),
        note200: new Decimal(0),
        note100: new Decimal(0),
        note50: new Decimal(0),
        note20: new Decimal(0),
        note10: new Decimal(0),
        coins: new Decimal(0),
      },
    );

    return {
      note2000: totals.note2000.toNumber(),
      note500: totals.note500.toNumber(),
      note200: totals.note200.toNumber(),
      note100: totals.note100.toNumber(),
      note50: totals.note50.toNumber(),
      note20: totals.note20.toNumber(),
      note10: totals.note10.toNumber(),
      coins: toMoney(totals.coins),
    };
  }

  getDenominationAmount(totals: DenominationTotals): number {
    const amount = toDecimal(totals.note2000)
      .times(2000)
      .plus(toDecimal(totals.note500).times(500))
      .plus(toDecimal(totals.note200).times(200))
      .plus(toDecimal(totals.note100).times(100))
      .plus(toDecimal(totals.note50).times(50))
      .plus(toDecimal(totals.note20).times(20))
      .plus(toDecimal(totals.note10).times(10))
      .plus(toDecimal(totals.coins));

    return toMoney(amount);
  }

  getDenominationAmountFromRow(row: DenominationRow | null): number {
    const amount = toDecimal(row?.note_2000 ?? 0)
      .times(2000)
      .plus(toDecimal(row?.note_500 ?? 0).times(500))
      .plus(toDecimal(row?.note_200 ?? 0).times(200))
      .plus(toDecimal(row?.note_100 ?? 0).times(100))
      .plus(toDecimal(row?.note_50 ?? 0).times(50))
      .plus(toDecimal(row?.note_20 ?? 0).times(20))
      .plus(toDecimal(row?.note_10 ?? 0).times(10))
      .plus(toDecimal(row?.coins ?? 0));

    return toMoney(amount);
  }

  getRouteCash(sheet: RouteCashSheet): number {
    const total = sheet.client_collection.reduce(
      (sum, collection) => sum.plus(toDecimal(collection.cash_collection ?? 0)),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getRouteExpenseTotal(sheet: RouteCashSheet): number {
    const total = (sheet.cash_route_settlement?.expenses ?? []).reduce(
      (sum, expense) => sum.plus(toDecimal(expense.amount)),
      new Decimal(0),
    );
    return toMoney(total);
  }

  // CS-4.2: a route has settlement activity when any money is recorded on it
  // (route cash, expenses or counted denominations).
  hasRouteActivity(sheet: RouteCashSheet): boolean {
    return (
      this.getRouteCash(sheet) !== 0 ||
      this.getRouteExpenseTotal(sheet) !== 0 ||
      this.getDenominationAmountFromRow(sheet.cash_route_settlement) !== 0
    );
  }

  getRouteNetCash(sheet: RouteCashSheet): number {
    return toMoney(
      toDecimal(this.getRouteCash(sheet)).minus(
        this.getRouteExpenseTotal(sheet),
      ),
    );
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
      coins: toMoney(toDecimal(first.coins).plus(toDecimal(second.coins))),
    };
  }

  getOfficeCash(
    totalRouteNetCash: number,
    totalDirectCollections: number,
  ): number {
    return toMoney(toDecimal(totalRouteNetCash).plus(totalDirectCollections));
  }

  getTotalRouteNetCash(sheets: RouteCashSheet[]): number {
    const total = sheets.reduce(
      (sum, sheet) => sum.plus(this.getRouteNetCash(sheet)),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getTotalRouteCash(rows: RouteSettlementRowDto[]): number {
    const total = rows.reduce(
      (sum, row) => sum.plus(row.routeCash),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getTotalRouteExpenses(rows: RouteSettlementRowDto[]): number {
    const total = rows.reduce(
      (sum, row) => sum.plus(row.expenseTotal),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getTotalRouteNetCashFromSettlements(rows: RouteSettlementRowDto[]): number {
    const total = rows.reduce(
      (sum, row) => sum.plus(row.routeNetCash),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getTotalRouteDenominationCash(rows: RouteSettlementRowDto[]): number {
    const total = rows.reduce(
      (sum, row) => sum.plus(row.denominationTotal),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getTotalDirectCollectionCash(rows: DirectCollectionRowDto[]): number {
    const total = rows.reduce(
      (sum, row) => sum.plus(row.collectionAmount),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getTotalDeposits(rows: BankDepositRowDto[]): number {
    const total = rows.reduce(
      (sum, row) => sum.plus(row.depositAmount),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getRevisedCashBeforeDeposits(
    totalRouteNetCash: number,
    historicalDirectCollectionCash: number,
  ): number {
    return toMoney(
      toDecimal(totalRouteNetCash).plus(historicalDirectCollectionCash),
    );
  }

  getHistoricalCashOnHand(
    historicalRouteDenominationCash: number,
    historicalDirectCollectionCash: number,
    totalDeposits: number,
  ): number {
    return toMoney(
      toDecimal(historicalRouteDenominationCash)
        .plus(historicalDirectCollectionCash)
        .minus(totalDeposits),
    );
  }

  getReconciliationDifference(
    revisedCashOnHand: number,
    historicalCashOnHand: number,
  ): number {
    return toMoney(toDecimal(revisedCashOnHand).minus(historicalCashOnHand));
  }

  getCashInHandAfterDeposits(
    officeCash: number,
    totalDeposits: number,
  ): number {
    return toMoney(toDecimal(officeCash).minus(totalDeposits));
  }

  getRouteCashFromCollections(
    collections: { cash_collection: unknown }[],
  ): number {
    const total = collections.reduce(
      (sum, c) => sum.plus(toDecimal(c.cash_collection ?? 0)),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getRouteExpenseTotalFromExpenses(expenses: { amount: unknown }[]): number {
    const total = expenses.reduce(
      (sum, e) => sum.plus(toDecimal(e.amount ?? 0)),
      new Decimal(0),
    );
    return toMoney(total);
  }

  getRevisedCashOnHand(
    revisedOfficeCash: number,
    historicalDeposits: number,
  ): number {
    return toMoney(toDecimal(revisedOfficeCash).minus(historicalDeposits));
  }
}
