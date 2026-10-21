import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CashSettlementRepository } from '../cash-settlement.repository.js';

import {
  CASH_SETTLEMENT_ERRORS,
  CASH_SETTLEMENT_VALIDATION_ERRORS as MSG,
} from '../cash-settlement.constants.js';

import { WorkflowStateService } from '../../workflow/workflow-state.service.js';

import { CashSettlementCalculationService } from '../../../../common/calculators/cash-settlement.calculator.js';

import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { OrderPaperStatus } from '../../../../generated/prisma/client.js';
import {
  moneyEquals,
  moneyGreaterThan,
} from '../../../../common/utils/money.util.js';
import { CashSubmissionStatusDto } from '../dto/cash-settlement-response.dto.js';

const RECONCILIATION_TOLERANCE = 0.005;

type CashSettlementPaper = NonNullable<
  Awaited<ReturnType<CashSettlementRepository['getCashSettlementData']>>
>;

const unique = (ids: number[]) => [...new Set(ids)];
const duplicatesOf = (ids: number[]) =>
  unique(ids.filter((id, index) => ids.indexOf(id) !== index));

@Injectable()
export class CashSettlementValidationService {
  constructor(
    private readonly cashSettlementRepository: CashSettlementRepository,
    private readonly cashSettlementCalculationService: CashSettlementCalculationService,
    private readonly workflowStateService: WorkflowStateService,
  ) {}

  // CS-13.1: a missing paper is 404, as in every other module.
  async getCashSettlementPaper(paperId: number, db?: PrismaOrTransaction) {
    const paper = await this.cashSettlementRepository.getCashSettlementData(
      paperId,
      db,
    );

    if (!paper) {
      throw new NotFoundException(CASH_SETTLEMENT_ERRORS.PAPER_NOT_FOUND);
    }

    // CS-4.2: a route of a deactivated group is shown only while it has money
    // recorded on it. Everything built from this paper (screen, totals, gates)
    // sees the same set of routes.
    return {
      ...paper,
      order_sheet: paper.order_sheet.filter(
        (sheet) =>
          sheet.master_group.is_active ||
          this.cashSettlementCalculationService.hasRouteActivity(sheet),
      ),
    };
  }

  // ---------------------------------------------------------------------
  // Workflow gates. CS-2.2: the services call these INSIDE the transaction.
  // They return the paper header so the caller can compare the token.
  // ---------------------------------------------------------------------

  private async validateEditing(
    paperId: number,
    canEdit: (status: OrderPaperStatus) => boolean,
    db: PrismaOrTransaction,
  ) {
    const header = await this.cashSettlementRepository.getPaperHeader(
      paperId,
      db,
    );

    if (!header) {
      throw new NotFoundException(CASH_SETTLEMENT_ERRORS.PAPER_NOT_FOUND);
    }

    if (!canEdit(header.status)) {
      throw new BadRequestException(CASH_SETTLEMENT_ERRORS.EDITING_NOT_ALLOWED);
    }

    return header;
  }

  validateRouteExpenseEditing(paperId: number, db: PrismaOrTransaction) {
    return this.validateEditing(
      paperId,
      (s) => this.workflowStateService.canEditRouteExpenses(s),
      db,
    );
  }

  validateRouteDenominationEditing(paperId: number, db: PrismaOrTransaction) {
    return this.validateEditing(
      paperId,
      (s) => this.workflowStateService.canEditRouteDenominations(s),
      db,
    );
  }

  validateDirectCollectionEditing(paperId: number, db: PrismaOrTransaction) {
    return this.validateEditing(
      paperId,
      (s) => this.workflowStateService.canEditDirectCollections(s),
      db,
    );
  }

  validateBankDepositEditing(paperId: number, db: PrismaOrTransaction) {
    return this.validateEditing(
      paperId,
      (s) => this.workflowStateService.canEditBankDeposits(s),
      db,
    );
  }

  // ---------------------------------------------------------------------
  // Submission and finalization gates (called by the paper workflow)
  // ---------------------------------------------------------------------

  /**
   * CS-12.1 / CS-12.4: route reconciliation and deposit checks are both
   * evaluated and reported together, every problem listed.
   */
  async validateMorningSubmitReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const paper = await this.getCashSettlementPaper(paperId, db);
    const status = this.getSubmissionStatus(paper);

    if (!status.ready) {
      throw new BadRequestException({
        message: CASH_SETTLEMENT_ERRORS.NOT_READY_FOR_SUBMISSION,
        details: [...status.routeMismatches, ...status.depositProblems],
      });
    }
  }

  /**
   * CS-12.5: a reopened paper must reconcile route by route (an error on one
   * route cannot hide behind the opposite error on another). Any other status
   * is not checked here.
   */
  async validateReconciliationOnFinalize(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const paper = await this.getCashSettlementPaper(paperId, db);
    if (paper.status !== OrderPaperStatus.REOPENED) return;

    const details = this.findRouteMismatches(paper);

    if (details.length > 0) {
      throw new BadRequestException({
        message: CASH_SETTLEMENT_ERRORS.NOT_RECONCILED_AFTER_REOPEN,
        details,
      });
    }
  }

  getSubmissionStatus(paper: CashSettlementPaper): CashSubmissionStatusDto {
    const routeMismatches = this.findRouteMismatches(paper);
    const depositProblems = this.findDepositProblems(paper);

    return {
      ready: routeMismatches.length === 0 && depositProblems.length === 0,
      routeMismatches,
      depositProblems,
    };
  }

  // CS-12.2: every route whose net cash differs from its counted denominations.
  private findRouteMismatches(paper: CashSettlementPaper): string[] {
    const problems: string[] = [];

    for (const sheet of paper.order_sheet) {
      const routeNetCash =
        this.cashSettlementCalculationService.getRouteNetCash(sheet);

      const denominationTotal =
        this.cashSettlementCalculationService.getDenominationAmountFromRow(
          sheet.cash_route_settlement,
        );

      if (
        !moneyEquals(routeNetCash, denominationTotal, RECONCILIATION_TOLERANCE)
      ) {
        problems.push(
          MSG.ROUTE_CASH_MISMATCH(
            sheet.master_group.name,
            routeNetCash,
            denominationTotal,
          ),
        );
      }
    }

    return problems;
  }

  // CS-12.3: deposits against office cash, then note by note against counted cash.
  private findDepositProblems(paper: CashSettlementPaper): string[] {
    const problems: string[] = [];

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

    if (moneyGreaterThan(totalDeposits, officeCash)) {
      problems.push(MSG.BANK_DEPOSIT_EXCEEDS_CASH(officeCash, totalDeposits));
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
        problems.push(
          MSG.BANK_DEPOSIT_DENOMINATION_EXCEEDS(label, available, deposited),
        );
      }
    }

    return problems;
  }

  // ---------------------------------------------------------------------
  // Request checks that need no database (run before the transaction)
  // ---------------------------------------------------------------------

  validateNoDuplicateRoutes(entries: { sheetId: number }[]): void {
    const duplicates = duplicatesOf(entries.map((e) => e.sheetId));
    if (duplicates.length > 0) {
      throw new BadRequestException(MSG.DUPLICATE_ROUTES(duplicates));
    }
  }

  validateNoDuplicateRecordIds(
    label: string,
    ids: (number | null | undefined)[],
  ): void {
    const present = ids.filter((id): id is number => id != null);
    const duplicates = duplicatesOf(present);
    if (duplicates.length > 0) {
      throw new BadRequestException(
        MSG.DUPLICATE_RECORD_IDS(label, duplicates),
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

  // ---------------------------------------------------------------------
  // Request checks that need the database (run inside the transaction)
  // ---------------------------------------------------------------------

  async validateSheetsBelongToPaper(
    paperId: number,
    sheetIds: number[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    const uniqueIds = unique(sheetIds);
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

  async validateExpenseTypesExist(
    expenseTypeIds: number[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    const uniqueIds = unique(expenseTypeIds);
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
    const uniqueIds = unique(bankIds);
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

  /**
   * CS-8.5: every employee must exist. An inactive employee can no longer
   * receive a NEW direct collection, but one who already has a row on this
   * paper stays updatable (same historical rule as Collections CD-6.2).
   */
  async validateEmployees(
    entries: { employeeId: number }[],
    employeeIdsWithRow: Set<number>,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const ids = unique(entries.map((e) => e.employeeId));
    if (ids.length === 0) return;

    const employees = await db.master_employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, is_active: true },
    });
    const foundIds = new Set(employees.map((e) => e.id));

    const problems: string[] = [];

    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) problems.push(MSG.EMPLOYEE_NOT_FOUND(missing));

    const inactive = employees
      .filter((e) => !e.is_active && !employeeIdsWithRow.has(e.id))
      .map((e) => e.name);
    if (inactive.length > 0) problems.push(MSG.EMPLOYEE_INACTIVE(inactive));

    if (problems.length > 0) {
      throw new BadRequestException({
        message: CASH_SETTLEMENT_ERRORS.INVALID_ENTRIES,
        details: problems,
      });
    }
  }

  validateDeletedEmployees(
    paperId: number,
    entries: { employeeId: number }[],
    deletedEmployeeIds: number[],
    employeeIdsWithRow: Set<number>,
  ): void {
    const label = 'Direct collection employee';
    const problems: string[] = [];

    const unknown = unique(deletedEmployeeIds).filter(
      (id) => !employeeIdsWithRow.has(id),
    );
    if (unknown.length > 0) {
      problems.push(MSG.RECORD_NOT_IN_PAPER(label, unknown, paperId));
    }

    const deleted = new Set(deletedEmployeeIds);
    const both = unique(entries.map((e) => e.employeeId)).filter((id) =>
      deleted.has(id),
    );
    if (both.length > 0) problems.push(MSG.RECORD_ALSO_DELETED(label, both));

    if (problems.length > 0) {
      throw new BadRequestException({
        message: CASH_SETTLEMENT_ERRORS.INVALID_ENTRIES,
        details: problems,
      });
    }
  }

  // CS-6.4: sent ids and deleted ids must belong to this paper, never overlap,
  // and an expense cannot move to another route.
  validateExpenseChanges(
    paperId: number,
    expenses: { id?: number | null; sheetId: number }[],
    deletedIds: number[],
    existing: { id: number; sheetId: number }[],
  ): void {
    const existingById = new Map(existing.map((e) => [e.id, e]));
    const sent = expenses.filter((e) => e.id != null);

    const problems = this.checkRecordIds(
      'Route expense',
      paperId,
      sent.map((e) => e.id!),
      deletedIds,
      new Set(existingById.keys()),
    );

    const moved = sent
      .filter((e) => {
        const stored = existingById.get(e.id!);
        return stored !== undefined && stored.sheetId !== e.sheetId;
      })
      .map((e) => e.id!);
    if (moved.length > 0) problems.push(MSG.EXPENSE_ROUTE_CHANGED(moved));

    this.throwIfProblems(problems);
  }

  validateBankDepositChanges(
    paperId: number,
    deposits: { id?: number | null }[],
    deletedIds: number[],
    existingIds: Set<number>,
  ): void {
    this.throwIfProblems(
      this.checkRecordIds(
        'Bank deposit',
        paperId,
        deposits.filter((d) => d.id != null).map((d) => d.id!),
        deletedIds,
        existingIds,
      ),
    );
  }

  private checkRecordIds(
    label: string,
    paperId: number,
    sentIds: number[],
    deletedIds: number[],
    existingIds: Set<number>,
  ): string[] {
    const problems: string[] = [];

    const unknown = unique([...sentIds, ...deletedIds]).filter(
      (id) => !existingIds.has(id),
    );
    if (unknown.length > 0) {
      problems.push(MSG.RECORD_NOT_IN_PAPER(label, unknown, paperId));
    }

    const deleted = new Set(deletedIds);
    const both = unique(sentIds.filter((id) => deleted.has(id)));
    if (both.length > 0) problems.push(MSG.RECORD_ALSO_DELETED(label, both));

    return problems;
  }

  private throwIfProblems(problems: string[]): void {
    if (problems.length > 0) {
      throw new BadRequestException({
        message: CASH_SETTLEMENT_ERRORS.INVALID_ENTRIES,
        details: problems,
      });
    }
  }
}
