import { Injectable } from '@nestjs/common';
import { CashSettlementRepository } from './cash-settlement.repository.js';
import {
  BankDepositRowDto,
  CashSettlementResponseDto,
  DirectCollectionRowDto,
  RouteDenominationRowDto,
  RouteExpenseRowDto,
  RouteSettlementRowDto,
} from './dto/cash-settlement-response.dto.js';

import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import { CashSettlementCalculationService } from '../../../common/calculators/cash-settlement.calculator.js';

@Injectable()
export class CashSettlementBuilder {
  constructor(
    private readonly cashSettlementCalculationService: CashSettlementCalculationService,
  ) {}
  buildCashSettlement(
    paper: NonNullable<
      Awaited<ReturnType<CashSettlementRepository['getCashSettlementData']>>
    >,
  ): CashSettlementResponseDto {
    const routeSettlements: RouteSettlementRowDto[] = paper.order_sheet.map(
      (sheet) => {
        const routeCash =
          this.cashSettlementCalculationService.getRouteCash(sheet);

        const expenseTotal =
          this.cashSettlementCalculationService.getRouteExpenseTotal(sheet);

        const routeNetCash =
          this.cashSettlementCalculationService.getRouteNetCash(sheet);
        const denominationTotal = sheet.cash_route_settlement
          ? this.cashSettlementCalculationService.getDenominationAmountFromRow(
              sheet.cash_route_settlement,
            )
          : 0;

        return {
          sheetId: sheet.id,
          routeName: sheet.master_group.name,

          routeCash,
          expenseTotal,
          routeNetCash,

          denominationTotal,
          difference: routeNetCash - denominationTotal,
        };
      },
    );

    const routeExpenses: RouteExpenseRowDto[] = [];

    for (const sheet of paper.order_sheet) {
      const settlement = sheet.cash_route_settlement;

      if (!settlement) {
        continue;
      }

      for (const expense of settlement.expenses) {
        routeExpenses.push({
          id: expense.id,

          sheetId: sheet.id,

          routeName: sheet.master_group.name,

          expenseTypeId: expense.expense_type_id,

          expenseTypeName: expense.expense_type.name,

          amount: Number(expense.amount),
        });
      }
    }

    const routeDenominations: RouteDenominationRowDto[] = [];

    for (const sheet of paper.order_sheet) {
      const settlement = sheet.cash_route_settlement;

      if (!settlement) {
        continue;
      }

      const denominationTotal =
        this.cashSettlementCalculationService.getDenominationAmountFromRow(
          settlement,
        );

      routeDenominations.push({
        sheetId: sheet.id,

        routeName: sheet.master_group.name,

        note2000: settlement.note_2000,

        note500: settlement.note_500,

        note200: settlement.note_200,

        note100: settlement.note_100,

        note50: settlement.note_50,

        note20: settlement.note_20,

        note10: settlement.note_10,

        coins: Number(settlement.coins),

        denominationTotal,
      });
    }

    const directCollections: DirectCollectionRowDto[] = [];

    for (const collection of paper.cash_direct_collections) {
      const collectionAmount =
        this.cashSettlementCalculationService.getDenominationAmountFromRow(
          collection,
        );

      directCollections.push({
        id: collection.id,

        employeeId: collection.employee_id,

        employeeName: collection.employee.name,

        note2000: collection.note_2000,

        note500: collection.note_500,

        note200: collection.note_200,

        note100: collection.note_100,

        note50: collection.note_50,

        note20: collection.note_20,

        note10: collection.note_10,

        coins: Number(collection.coins),

        collectionAmount,
      });
    }

    const bankDeposits: BankDepositRowDto[] = [];

    for (const deposit of paper.cash_bank_deposits) {
      const depositAmount =
        this.cashSettlementCalculationService.getDenominationAmountFromRow(
          deposit,
        );

      bankDeposits.push({
        id: deposit.id,

        bankId: deposit.bank_id,

        bankName: deposit.bank.name,

        note2000: deposit.note_2000,

        note500: deposit.note_500,

        note200: deposit.note_200,

        note100: deposit.note_100,

        note50: deposit.note_50,

        note20: deposit.note_20,

        note10: deposit.note_10,

        coins: Number(deposit.coins),

        depositAmount,
      });
    }
    const totalRouteCash =
      this.cashSettlementCalculationService.getTotalRouteCash(routeSettlements);

    const totalRouteExpenses =
      this.cashSettlementCalculationService.getTotalRouteExpenses(
        routeSettlements,
      );

    const totalRouteNetCash =
      this.cashSettlementCalculationService.getTotalRouteNetCashFromSettlements(
        routeSettlements,
      );

    const totalRouteDenominationCash =
      this.cashSettlementCalculationService.getTotalRouteDenominationCash(
        routeSettlements,
      );

    const directCollectionCash =
      this.cashSettlementCalculationService.getTotalDirectCollectionCash(
        directCollections,
      );

    const totalDeposits =
      this.cashSettlementCalculationService.getTotalDeposits(bankDeposits);

    if (paper.status === OrderPaperStatus.REOPENED) {
      const historicalRouteDenominationCash = totalRouteDenominationCash;

      const historicalDirectCollectionCash = directCollectionCash;

      const revisedOfficeCash =
        this.cashSettlementCalculationService.getRevisedCashBeforeDeposits(
          totalRouteNetCash,
          historicalDirectCollectionCash,
        );

      const historicalCashOnHand =
        this.cashSettlementCalculationService.getHistoricalCashOnHand(
          historicalRouteDenominationCash,
          historicalDirectCollectionCash,
          totalDeposits,
        );

      const revisedCashOnHand =
        this.cashSettlementCalculationService.getRevisedCashOnHand(
          revisedOfficeCash,
          totalDeposits,
        );

      const reconciliationDifference =
        this.cashSettlementCalculationService.getReconciliationDifference(
          revisedCashOnHand,
          historicalCashOnHand,
        );
      return {
        routeSettlements,
        routeExpenses,
        routeDenominations,
        directCollections,
        bankDeposits,
        summary: {
          totalRouteCash,
          totalRouteExpenses,
          totalRouteNetCash,
          historicalRouteDenominationCash,
          historicalDirectCollectionCash,
          revisedOfficeCash,
          totalDeposits,
          revisedCashOnHand,
          historicalCashOnHand,
          reconciliationDifference,
        },
      };
    }

    const officeCash = this.cashSettlementCalculationService.getOfficeCash(
      totalRouteNetCash,
      directCollectionCash,
    );

    const cashInHandAfterDeposits =
      this.cashSettlementCalculationService.getCashInHandAfterDeposits(
        officeCash,
        totalDeposits,
      );

    return {
      routeSettlements,
      routeExpenses,
      routeDenominations,
      directCollections,
      bankDeposits,
      summary: {
        totalRouteCash,
        totalRouteExpenses,
        totalRouteNetCash,
        directCollectionCash,
        officeCash,
        totalDeposits,
        cashInHandAfterDeposits,
      },
    };
  }
}
