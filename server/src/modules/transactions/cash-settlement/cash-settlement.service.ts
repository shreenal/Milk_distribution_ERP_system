import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { CashSettlementRepository } from './cash-settlement.repository.js';
import { CashSettlementBuilder } from './cash-settlement.builder.js';

import { SaveRouteExpensesDto } from './dto/save-route-expense.dto.js';
import { SaveRouteDenominationsDto } from './dto/save-route-denominations.dto.js';
import { SaveDirectCollectionsDto } from './dto/save-direct-collections.dto.js';
import { SaveBankDepositsDto } from './dto/save-bank-deposit.dto.js';

import { CashSettlementValidationService } from './services/cash-settlement-validation.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import {
  CASH_SETTLEMENT_ERRORS,
  STALE_DATA_MESSAGE,
} from './cash-settlement.constants.js';

type SavePlan = { changed: boolean; write: () => Promise<void> };

type SaveFlow = {
  paperId: number;
  expectedUpdatedAt: string | null;
  // Workflow gate: paper exists (404) and the status allows this section (400).
  checkEditing: (tx: Prisma.TransactionClient) => Promise<{ updated_at: Date }>;
  // Request-vs-database checks. Returns whether anything would change and the
  // function that performs the writes (CS-10.5).
  plan: (tx: Prisma.TransactionClient) => Promise<SavePlan>;
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
        await validation.validateExpenseTypesExist(
          dto.expenses.map((e) => e.expenseTypeId),
          tx,
        );

        const existing = await this.repository.findExpensesForPaper(
          paperId,
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

        await validation.validateEmployees(
          dto.directCollections,
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
        await validation.validateBanksExist(
          dto.bankDeposits.map((d) => d.bankId),
          tx,
        );

        const existing = await this.repository.findBankDeposits(paperId, tx);
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
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const header = await flow.checkEditing(tx);

          const expected = this.parseExpected(flow.expectedUpdatedAt);
          if (header.updated_at.getTime() !== expected.getTime()) {
            throw new ConflictException(STALE_DATA_MESSAGE);
          }

          const plan = await flow.plan(tx);

          // A no-op save never advances the token (as OD-12.8, CD-9.4,
          // VA-5.15, PD-57). A stale token was already rejected above.
          let token = header.updated_at;
          if (plan.changed) {
            const touch = await this.repository.touchOrderPaperIfTokenMatches(
              flow.paperId,
              expected,
              tx,
            );
            if (touch.count !== 1) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
            token = touch.touchedAt;

            await plan.write();
          }

          // CS-11: the response carries the token and the recalculated
          // screen, so the frontend never needs a follow-up GET.
          const paper =
            await this.cashSettlementValidationService.getCashSettlementPaper(
              flow.paperId,
              tx,
            );

          return {
            success: true,
            changed: plan.changed,
            cashSettlementUpdatedAt: token.toISOString(),
            ...this.buildView(paper),
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
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
    const date = new Date(expected);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        CASH_SETTLEMENT_ERRORS.INVALID_EXPECTED_UPDATED_AT,
      );
    }
    return date;
  }
}
