import { Injectable } from '@nestjs/common';

import { CashSettlementRepository } from './cash-settlement.repository.js';
import { CashSettlementBuilder } from './cash-settlement.builder.js';

import { SaveRouteExpensesDto } from './dto/save-route-expense.dto.js';
import { SaveRouteDenominationsDto } from './dto/save-route-denominations.dto.js';
import { SaveDirectCollectionsDto } from './dto/save-direct-collections.dto.js';
import { SaveBankDepositsDto } from './dto/save-bank-deposit.dto.js';

import { CashSettlementValidationService } from './services/cash-settlement-validation.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

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

    return this.prisma.$transaction(async (tx) => {
      const expensesBySheet = new Map<number, typeof dto.expenses>();

      for (const expense of dto.expenses) {
        const existing = expensesBySheet.get(expense.sheetId) ?? [];

        existing.push(expense);

        expensesBySheet.set(expense.sheetId, existing);
      }

      for (const [sheetId, expenses] of expensesBySheet) {
        await this.repository.replaceRouteExpenses(sheetId, expenses, tx);
      }

      return {
        success: true,
      };
    });
  }

  async saveRouteDenominationsService(
    paperId: number,
    dto: SaveRouteDenominationsDto,
  ) {
    await this.cashSettlementValidationService.validateRouteDenominationEditing(
      paperId,
    );

    return this.prisma.$transaction(async (tx) => {
      for (const denomination of dto.denominations) {
        await this.repository.saveRouteDenomination(denomination, tx);
      }

      return {
        success: true,
      };
    });
  }

  async saveDirectCollectionsService(
    paperId: number,
    dto: SaveDirectCollectionsDto,
  ) {
    await this.cashSettlementValidationService.validateDirectCollectionEditing(
      paperId,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.repository.replaceDirectCollections(
        paperId,
        dto.directCollections,
        tx,
      );

      return {
        success: true,
      };
    });
  }

  async saveBankDepositsService(paperId: number, dto: SaveBankDepositsDto) {
    await this.cashSettlementValidationService.validateBankDepositEditing(
      paperId,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.repository.replaceBankDeposits(paperId, dto.bankDeposits, tx);

      return {
        success: true,
      };
    });
  }
}
