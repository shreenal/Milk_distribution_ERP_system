import { ConflictException, Injectable } from '@nestjs/common';

import {
  CashSettlementRepository,
  isAllZero,
} from './cash-settlement.repository.js';
import { CashSettlementBuilder } from './cash-settlement.builder.js';

import { SaveRouteExpensesDto } from './dto/save-route-expense.dto.js';
import { SaveRouteDenominationsDto } from './dto/save-route-denominations.dto.js';
import { SaveDirectCollectionsDto } from './dto/save-direct-collections.dto.js';
import { SaveBankDepositsDto } from './dto/save-bank-deposit.dto.js';

import { CashSettlementValidationService } from './services/cash-settlement-validation.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { optimisticConcurrency } from '../../../common/transactions/optimistic-concurrency.service.js';
import { runTransactionSave } from '../../../common/transactions/transaction-save-pipeline.js';
import {
  CASH_SETTLEMENT_ERRORS,
  STALE_DATA_MESSAGE,
} from './cash-settlement.constants.js';
import type { SaveChangePlan } from '../../../common/transactions/transaction-save-pipeline.js';

type SaveFlow = {
  paperId: number;
  expectedUpdatedAt: string | null;
  // Workflow gate: paper exists (404) and the status allows this section (400).
  checkEditing: (tx: Prisma.TransactionClient) => Promise<{ updated_at: Date }>;
  // Request-vs-database checks. Returns whether anything would change and the
  // function that performs the writes (CS-10.5).
  plan: (tx: Prisma.TransactionClient) => Promise<SaveChangePlan>;
};

@Injectable()
export class CashSettlementService {
  constructor(
    private readonly repository: CashSettlementRepository,
    private readonly cashSettlementValidationService: CashSettlementValidationService,
    private readonly builder: CashSettlementBuilder,
    private readonly workflowBuilder: WorkflowBuilder,
    private readonly prisma: PrismaService,
  ) {}

  async getCashSettlementService(paperId: number) {
    const paper =
      await this.cashSettlementValidationService.getCashSettlementPaper(
        paperId,
      );

    const workflow = this.workflowBuilder.buildCashSettlementWorkflow(
      paper.status,
    );

    return {
      paper: {
        id: paper.id,
        order_date: paper.order_date,
        sale_date: paper.sale_date,
        status: paper.status,
        night_entry_submitted_at: paper.night_entry_submitted_at,
        morning_entry_submitted_at: paper.morning_entry_submitted_at,
        finalized_at: paper.finalized_at,
        reopened_at: paper.reopened_at,
        reopen_reason: paper.reopen_reason,
        created_at: paper.created_at,
        updated_at: paper.updated_at,
      },
      workflow,
      // CS-10.2: the concurrency token, sent back as expectedUpdatedAt.
      cashSettlementUpdatedAt: paper.updated_at.toISOString(),
      ...this.buildView(paper),
    };
  }

  async saveRouteExpensesService(paperId: number, dto: SaveRouteExpensesDto) {
    const validation = this.cashSettlementValidationService;
    const deletedIds = dto.deletedExpenseIds ?? [];

    validation.validateNoDuplicateRecordIds(
      'Route expense',
      dto.expenses.map((e) => e.id),
    );

    return this.runSave({
      paperId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      checkEditing: (tx) => validation.validateRouteExpenseEditing(paperId, tx),
      plan: async (tx) => {
        await validation.validateSheetsBelongToPaper(
          paperId,
          dto.expenses.map((e) => e.sheetId),
          tx,
        );

        const existing = await this.repository.findExpensesForPaper(
          paperId,
          tx,
        );

        // CS-6.4: the active check applies only to new lines and to lines whose
        // type is being changed. A saved line keeps its type even if that type
        // was deactivated since (historical-record rule).
        const storedTypeById = new Map(
          existing.map((e) => [e.id, e.expense_type_id] as const),
        );
        await validation.validateExpenseTypesExist(
          dto.expenses
            .filter(
              (e) =>
                e.id == null || storedTypeById.get(e.id) !== e.expenseTypeId,
            )
            .map((e) => e.expenseTypeId),
          tx,
        );
        validation.validateExpenseChanges(
          paperId,
          dto.expenses,
          deletedIds,
          existing.map((e) => ({
            id: e.id,
            sheetId: e.route_settlement.order_sheet_id,
          })),
        );

        const changes = this.repository.planExpenseChanges(
          dto.expenses,
          deletedIds,
          existing,
        );
        return {
          changed: changes.changed,
          write: () => this.repository.applyExpenseChanges(changes, tx),
        };
      },
    });
  }

  async saveRouteDenominationsService(
    paperId: number,
    dto: SaveRouteDenominationsDto,
  ) {
    const validation = this.cashSettlementValidationService;

    validation.validateNoDuplicateRoutes(dto.denominations);

    return this.runSave({
      paperId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      checkEditing: (tx) =>
        validation.validateRouteDenominationEditing(paperId, tx),
      plan: async (tx) => {
        const sheetIds = dto.denominations.map((d) => d.sheetId);
        await validation.validateSheetsBelongToPaper(paperId, sheetIds, tx);

        const existing = await this.repository.findRouteSettlements(
          sheetIds,
          tx,
        );
        const changes = this.repository.planDenominationChanges(
          dto.denominations,
          existing,
        );
        return {
          changed: changes.changed,
          write: () => this.repository.applyDenominationChanges(changes, tx),
        };
      },
    });
  }

  async saveDirectCollectionsService(
    paperId: number,
    dto: SaveDirectCollectionsDto,
  ) {
    const validation = this.cashSettlementValidationService;
    const deletedEmployeeIds = dto.deletedEmployeeIds ?? [];

    validation.validateNoDuplicateEmployees(dto.directCollections);

    return this.runSave({
      paperId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      checkEditing: (tx) =>
        validation.validateDirectCollectionEditing(paperId, tx),
      plan: async (tx) => {
        const existing = await this.repository.findDirectCollections(
          paperId,
          tx,
        );
        const employeeIdsWithRow = new Set(existing.map((r) => r.employee_id));

        // CS-8.4 / CS-8.5: an all-zero entry for an employee with no stored row
        // creates nothing, so it is ignored before any employee rule.
        await validation.validateEmployees(
          dto.directCollections.filter(
            (c) => employeeIdsWithRow.has(c.employeeId) || !isAllZero(c),
          ),
          employeeIdsWithRow,
          tx,
        );
        validation.validateDeletedEmployees(
          paperId,
          dto.directCollections,
          deletedEmployeeIds,
          employeeIdsWithRow,
        );

        const changes = this.repository.planDirectCollectionChanges(
          paperId,
          existing,
          dto.directCollections,
          deletedEmployeeIds,
        );
        return {
          changed: changes.changed,
          write: () =>
            this.repository.applyDirectCollectionChanges(paperId, changes, tx),
        };
      },
    });
  }

  async saveBankDepositsService(paperId: number, dto: SaveBankDepositsDto) {
    const validation = this.cashSettlementValidationService;
    const deletedIds = dto.deletedDepositIds ?? [];

    validation.validateNoDuplicateRecordIds(
      'Bank deposit',
      dto.bankDeposits.map((d) => d.id),
    );

    return this.runSave({
      paperId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      checkEditing: (tx) => validation.validateBankDepositEditing(paperId, tx),
      plan: async (tx) => {
        const existing = await this.repository.findBankDeposits(paperId, tx);

        // CS-9.2: the active check applies only to new deposits and to deposits
        // whose bank is being changed.
        const storedBankById = new Map(
          existing.map((d) => [d.id, d.bank_id] as const),
        );
        await validation.validateBanksExist(
          dto.bankDeposits
            .filter(
              (d) => d.id == null || storedBankById.get(d.id) !== d.bankId,
            )
            .map((d) => d.bankId),
          tx,
        );
        validation.validateBankDepositChanges(
          paperId,
          dto.bankDeposits,
          deletedIds,
          new Set(existing.map((d) => d.id)),
        );

        const changes = this.repository.planBankDepositChanges(
          existing,
          dto.bankDeposits,
          deletedIds,
        );
        return {
          changed: changes.changed,
          write: () =>
            this.repository.applyBankDepositChanges(paperId, changes, tx),
        };
      },
    });
  }

  /**
   * The one save flow shared by all four sections (CS-2.2, CS-10):
   * paper (404) -> status (400) -> token (409) -> request checks (400)
   * -> if nothing changes: stop, token untouched (CS-10.5)
   * -> otherwise advance token -> write -> rebuild the full screen.
   */
  private async runSave(flow: SaveFlow) {
    return runTransactionSave(this.prisma, {
      loadContext: async (tx) => {
        const header = await flow.checkEditing(tx);

        const expected = this.parseExpected(flow.expectedUpdatedAt);
        if (header.updated_at.getTime() !== expected.getTime()) {
          throw new ConflictException(STALE_DATA_MESSAGE);
        }

        return { header, expected };
      },
      plan: (_context, tx) => flow.plan(tx),
      currentToken: ({ header }) => header.updated_at,
      advanceToken: async ({ expected }, tx) => {
        // A no-op save never advances the token (as OD-12.8, CD-9.4,
        // VA-5.15, PD-57). A stale token was already rejected above.
        const touch = await this.repository.touchOrderPaperIfTokenMatches(
          flow.paperId,
          expected,
          tx,
        );
        if (touch.count !== 1) {
          throw new ConflictException(STALE_DATA_MESSAGE);
        }
        return touch.touchedAt;
      },
      buildResponse: async (_context, result, tx) => {
        // CS-11: the response carries the token and the recalculated
        // screen, so the frontend never needs a follow-up GET.
        const paper =
          await this.cashSettlementValidationService.getCashSettlementPaper(
            flow.paperId,
            tx,
          );

        return {
          success: true,
          changed: result.changed,
          cashSettlementUpdatedAt: result.token!,
          ...this.buildView(paper),
        };
      },
    });
  }

  private buildView(
    paper: NonNullable<
      Awaited<ReturnType<CashSettlementRepository['getCashSettlementData']>>
    >,
  ) {
    return {
      ...this.builder.buildCashSettlement(paper),
      submission:
        this.cashSettlementValidationService.getSubmissionStatus(paper),
    };
  }

  // CS-10.1: the token always exists on a paper, so an explicit null can never
  // match (409). A malformed date is 400.
  private parseExpected(expected: string | null): Date {
    if (expected === null) {
      throw new ConflictException(STALE_DATA_MESSAGE);
    }
    return optimisticConcurrency.parseExpectedUpdatedAt(
      expected,
      CASH_SETTLEMENT_ERRORS.INVALID_EXPECTED_UPDATED_AT,
    )!;
  }
}
