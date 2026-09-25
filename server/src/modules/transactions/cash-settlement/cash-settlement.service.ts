import { ConflictException, Injectable } from '@nestjs/common';

import { CashSettlementRepository } from './cash-settlement.repository.js';
import { CashSettlementBuilder } from './cash-settlement.builder.js';

import { SaveRouteExpensesDto } from './dto/save-route-expense.dto.js';
import { SaveRouteDenominationsDto } from './dto/save-route-denominations.dto.js';
import { SaveDirectCollectionsDto } from './dto/save-direct-collections.dto.js';
import { SaveBankDepositsDto } from './dto/save-bank-deposit.dto.js';

import { CashSettlementValidationService } from './services/cash-settlement-validation.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { assertNotStale } from '../../../common/prisma/optimistic-concurrency.util.js';

const STALE_DATA_MESSAGE =
  'Cash Settlement data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

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

    const settlement = this.builder.buildCashSettlement(paper);

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
      ...settlement,
    };
  }

  async saveRouteExpensesService(paperId: number, dto: SaveRouteExpensesDto) {
    await this.cashSettlementValidationService.validateRouteExpenseEditing(
      paperId,
    );

    await this.cashSettlementValidationService.validateSheetsBelongToPaper(
      paperId,
      dto.expenses.map((e) => e.sheetId),
      this.prisma,
    );

    await this.cashSettlementValidationService.validateExpenseTypesExist(
      dto.expenses.map((e) => e.expenseTypeId),
      this.prisma,
    );

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const expensesBySheet = new Map<number, typeof dto.expenses>();

          for (const expense of dto.expenses) {
            const existing = expensesBySheet.get(expense.sheetId) ?? [];

            existing.push(expense);

            expensesBySheet.set(expense.sheetId, existing);
          }

          if (dto.expectedUpdatedAt) {
            const paper = await this.repository.getCashSettlementData(
              paperId,
              tx,
            ); // or a lighter findUnique on order_paper if preferred
            if (
              new Date(dto.expectedUpdatedAt).getTime() !==
              paper!.updated_at.getTime()
            ) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
            await assertNotStale(
              () =>
                this.repository.touchOrderPaperIfUnchanged(
                  paperId,
                  new Date(dto.expectedUpdatedAt!),
                  tx,
                ),
              STALE_DATA_MESSAGE,
            );
          }

          for (const [sheetId, expenses] of expensesBySheet) {
            await this.repository.replaceRouteExpenses(sheetId, expenses, tx);
          }

          return {
            success: true,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  async saveRouteDenominationsService(
    paperId: number,
    dto: SaveRouteDenominationsDto,
  ) {
    await this.cashSettlementValidationService.validateRouteDenominationEditing(
      paperId,
    );

    await this.cashSettlementValidationService.validateSheetsBelongToPaper(
      paperId,
      dto.denominations.map((e) => e.sheetId),
      this.prisma,
    );

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          if (dto.expectedUpdatedAt) {
            const paper = await this.repository.getCashSettlementData(
              paperId,
              tx,
            ); // or a lighter findUnique on order_paper if preferred
            if (
              new Date(dto.expectedUpdatedAt).getTime() !==
              paper!.updated_at.getTime()
            ) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
            await assertNotStale(
              () =>
                this.repository.touchOrderPaperIfUnchanged(
                  paperId,
                  new Date(dto.expectedUpdatedAt!),
                  tx,
                ),
              STALE_DATA_MESSAGE,
            );
          }
          for (const denomination of dto.denominations) {
            await this.repository.saveRouteDenomination(denomination, tx);
          }

          return {
            success: true,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  async saveDirectCollectionsService(
    paperId: number,
    dto: SaveDirectCollectionsDto,
  ) {
    await this.cashSettlementValidationService.validateDirectCollectionEditing(
      paperId,
    );

    this.cashSettlementValidationService.validateNoDuplicateEmployees(
      dto.directCollections,
    );

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          if (dto.expectedUpdatedAt) {
            const paper = await this.repository.getCashSettlementData(
              paperId,
              tx,
            ); // or a lighter findUnique on order_paper if preferred
            if (
              new Date(dto.expectedUpdatedAt).getTime() !==
              paper!.updated_at.getTime()
            ) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
            await assertNotStale(
              () =>
                this.repository.touchOrderPaperIfUnchanged(
                  paperId,
                  new Date(dto.expectedUpdatedAt!),
                  tx,
                ),
              STALE_DATA_MESSAGE,
            );
          }

          await this.repository.replaceDirectCollections(
            paperId,
            dto.directCollections,
            tx,
          );

          return {
            success: true,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  async saveBankDepositsService(paperId: number, dto: SaveBankDepositsDto) {
    await this.cashSettlementValidationService.validateBankDepositEditing(
      paperId,
    );

    await this.cashSettlementValidationService.validateBanksExist(
      dto.bankDeposits.map((d) => d.bankId),
      this.prisma,
    );

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          if (dto.expectedUpdatedAt) {
            const paper = await this.repository.getCashSettlementData(
              paperId,
              tx,
            ); // or a lighter findUnique on order_paper if preferred
            if (
              new Date(dto.expectedUpdatedAt).getTime() !==
              paper!.updated_at.getTime()
            ) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
            await assertNotStale(
              () =>
                this.repository.touchOrderPaperIfUnchanged(
                  paperId,
                  new Date(dto.expectedUpdatedAt!),
                  tx,
                ),
              STALE_DATA_MESSAGE,
            );
          }

          await this.repository.replaceBankDeposits(
            paperId,
            dto.bankDeposits,
            tx,
          );

          return {
            success: true,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }
}
