import { BadRequestException, Injectable } from '@nestjs/common';

import { CashSettlementRepository } from '../cash-settlement.repository.js';

import {
  CASH_SETTLEMENT_ERRORS,
  CASH_SETTLEMENT_VALIDATION_ERRORS,
} from '../cash-settlement.constants.js';

import { WorkflowStateService } from '../../workflow/workflow-state.service.js';

import { CashSettlementCalculationService } from '../../../../common/calculators/cash-settlement.calculator.js';

import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { OrderPaperStatus } from '../../../../generated/prisma/client.js';

@Injectable()
export class CashSettlementValidationService {
  constructor(
    private readonly cashSettlementRepository: CashSettlementRepository,
    private readonly cashSettlementCalculationService: CashSettlementCalculationService,
    private readonly workflowStateService: WorkflowStateService,
  ) {}

  async getCashSettlementPaper(paperId: number, db?: PrismaOrTransaction) {
    const paper = await this.cashSettlementRepository.getCashSettlementData(
      paperId,
      db,
    );

    if (!paper) {
      throw new BadRequestException(CASH_SETTLEMENT_ERRORS.PAPER_NOT_FOUND);
    }

    return paper;
  }

  async validateRouteExpenseEditing(paperId: number) {
    const paper = await this.getCashSettlementPaper(paperId);

    if (!this.workflowStateService.canEditRouteExpenses(paper.status)) {
      throw new BadRequestException(CASH_SETTLEMENT_ERRORS.EDITING_NOT_ALLOWED);
    }

    return paper;
  }

  async validateRouteDenominationEditing(paperId: number) {
    const paper = await this.getCashSettlementPaper(paperId);

    if (!this.workflowStateService.canEditRouteDenominations(paper.status)) {
      throw new BadRequestException(CASH_SETTLEMENT_ERRORS.EDITING_NOT_ALLOWED);
    }

    return paper;
  }

  async validateDirectCollectionEditing(paperId: number) {
    const paper = await this.getCashSettlementPaper(paperId);

    if (!this.workflowStateService.canEditDirectCollections(paper.status)) {
      throw new BadRequestException(CASH_SETTLEMENT_ERRORS.EDITING_NOT_ALLOWED);
    }

    return paper;
  }

  async validateBankDepositEditing(paperId: number) {
    const paper = await this.getCashSettlementPaper(paperId);

    if (!this.workflowStateService.canEditBankDeposits(paper.status)) {
      throw new BadRequestException(CASH_SETTLEMENT_ERRORS.EDITING_NOT_ALLOWED);
    }

    return paper;
  }

  async validateMorningSubmitReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const paper = await this.getCashSettlementPaper(paperId, db);

    this.validateRouteDenominationsFromPaper(paper);

    this.validateBankDepositsFromPaper(paper);
  }

  validateRouteDenominationsFromPaper(
    paper: NonNullable<
      Awaited<ReturnType<CashSettlementRepository['getCashSettlementData']>>
    >,
  ): void {
    for (const sheet of paper.order_sheet) {
      const routeNetCash =
        this.cashSettlementCalculationService.getRouteNetCash(sheet);

      const denominationTotal =
        this.cashSettlementCalculationService.getDenominationAmountFromRow(
          sheet.cash_route_settlement,
        );

      if (routeNetCash !== denominationTotal) {
        throw new BadRequestException(
          CASH_SETTLEMENT_VALIDATION_ERRORS.ROUTE_CASH_MISMATCH(
            sheet.master_group.name,
            routeNetCash,
            denominationTotal,
          ),
        );
      }
    }
  }

  validateBankDepositsFromPaper(
    paper: NonNullable<
      Awaited<ReturnType<CashSettlementRepository['getCashSettlementData']>>
    >,
  ): void {
    const totalRouteNetCash =
      this.cashSettlementCalculationService.getTotalRouteNetCash(
        paper.order_sheet,
      );

    const directCollectionTotals =
      this.cashSettlementCalculationService.getDenominationTotals(
        paper.cash_direct_collections,
      );

    const depositTotals =
      this.cashSettlementCalculationService.getDenominationTotals(
        paper.cash_bank_deposits,
      );

    const totalDirectCollections =
      this.cashSettlementCalculationService.getDenominationAmount(
        directCollectionTotals,
      );

    const totalDeposits =
      this.cashSettlementCalculationService.getDenominationAmount(
        depositTotals,
      );

    const officeCash = this.cashSettlementCalculationService.getOfficeCash(
      totalRouteNetCash,
      totalDirectCollections,
    );

    if (totalDeposits > officeCash) {
      throw new BadRequestException(
        CASH_SETTLEMENT_VALIDATION_ERRORS.BANK_DEPOSIT_EXCEEDS_CASH(
          officeCash,
          totalDeposits,
        ),
      );
    }

    const routeDenominationRows = paper.order_sheet
      .map((sheet) => sheet.cash_route_settlement)
      .filter(
        (settlement): settlement is NonNullable<typeof settlement> =>
          settlement !== null,
      );

    const routeDenominationTotals =
      this.cashSettlementCalculationService.getDenominationTotals(
        routeDenominationRows,
      );

    const availableDenominations =
      this.cashSettlementCalculationService.mergeDenominationTotals(
        routeDenominationTotals,
        directCollectionTotals,
      );

    const denominationChecks = [
      ['₹2000', depositTotals.note2000, availableDenominations.note2000],
      ['₹500', depositTotals.note500, availableDenominations.note500],
      ['₹200', depositTotals.note200, availableDenominations.note200],
      ['₹100', depositTotals.note100, availableDenominations.note100],
      ['₹50', depositTotals.note50, availableDenominations.note50],
      ['₹20', depositTotals.note20, availableDenominations.note20],
      ['₹10', depositTotals.note10, availableDenominations.note10],
      ['coins', depositTotals.coins, availableDenominations.coins],
    ] as const;

    for (const [label, deposited, available] of denominationChecks) {
      if (deposited > available) {
        throw new BadRequestException(
          `Bank deposit ${label} count exceeds available cash. Available: ${available}, Deposited: ${deposited}`,
        );
      }
    }
  }

  // cash-settlement-validation.service.ts
  async validateReconciliationOnFinalize(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const paper = await this.getCashSettlementPaper(paperId, db);
    if (paper.status !== OrderPaperStatus.REOPENED) return;

    const totalRouteNetCash =
      this.cashSettlementCalculationService.getTotalRouteNetCash(
        paper.order_sheet,
      );
    const directCollectionCash =
      this.cashSettlementCalculationService.getDenominationAmount(
        this.cashSettlementCalculationService.getDenominationTotals(
          paper.cash_direct_collections,
        ),
      );
    const totalDeposits =
      this.cashSettlementCalculationService.getDenominationAmount(
        this.cashSettlementCalculationService.getDenominationTotals(
          paper.cash_bank_deposits,
        ),
      );
    const routeDenominationRows = paper.order_sheet
      .map((s) => s.cash_route_settlement)
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const historicalRouteDenominationCash =
      this.cashSettlementCalculationService.getDenominationAmount(
        this.cashSettlementCalculationService.getDenominationTotals(
          routeDenominationRows,
        ),
      );

    const revisedOfficeCash =
      this.cashSettlementCalculationService.getRevisedCashBeforeDeposits(
        totalRouteNetCash,
        directCollectionCash,
      );
    const revisedCashOnHand =
      this.cashSettlementCalculationService.getRevisedCashOnHand(
        revisedOfficeCash,
        totalDeposits,
      );
    const historicalCashOnHand =
      this.cashSettlementCalculationService.getHistoricalCashOnHand(
        historicalRouteDenominationCash,
        directCollectionCash,
        totalDeposits,
      );
    const difference =
      this.cashSettlementCalculationService.getReconciliationDifference(
        revisedCashOnHand,
        historicalCashOnHand,
      );

    if (difference !== 0) {
      throw new BadRequestException(
        `Cash settlement no longer reconciles after reopening (difference: ₹${difference.toFixed(2)}). ` +
          `Route denominations must be re-entered before finalizing.`,
      );
    }
  }

  // cash-settlement-validation.service.ts
  async validateSheetsBelongToPaper(
    paperId: number,
    sheetIds: number[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    const uniqueIds = [...new Set(sheetIds)];
    const sheets = await db.order_sheet.findMany({
      where: { id: { in: uniqueIds }, order_paper_id: paperId },
      select: { id: true },
    });
    const validIds = new Set(sheets.map((s) => s.id));
    const invalid = uniqueIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Sheet(s) ${invalid.join(', ')} do not belong to paper ${paperId}`,
      );
    }
  }

  validateNoDuplicateEmployees(entries: { employeeId: number }[]): void {
    const seen = new Set<number>();
    const duplicates: number[] = [];
    for (const e of entries) {
      if (seen.has(e.employeeId)) duplicates.push(e.employeeId);
      seen.add(e.employeeId);
    }
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Duplicate employee entries found: ${duplicates.join(', ')}. Each employee can only appear once per save.`,
      );
    }
  }

  async validateExpenseTypesExist(
    expenseTypeIds: number[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    const uniqueIds = [...new Set(expenseTypeIds)];
    const found = await db.master_expense_type.findMany({
      where: { id: { in: uniqueIds }, is_active: true },
      select: { id: true },
    });
    const validIds = new Set(found.map((f) => f.id));
    const invalid = uniqueIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid or inactive expense type(s): ${invalid.join(', ')}`,
      );
    }
  }

  async validateBanksExist(
    bankIds: number[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    const uniqueIds = [...new Set(bankIds)];
    const found = await db.master_bank.findMany({
      where: { id: { in: uniqueIds }, is_active: true },
      select: { id: true },
    });
    const validIds = new Set(found.map((f) => f.id));
    const invalid = uniqueIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid or inactive bank(s): ${invalid.join(', ')}`,
      );
    }
  }
}
