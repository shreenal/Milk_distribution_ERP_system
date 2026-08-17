import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CashSettlementRepository } from '../cash-settlement.repository.js';

import {
  CASH_SETTLEMENT_ERRORS,
  CASH_SETTLEMENT_VALIDATION_ERRORS,
} from '../cash-settlement.constants.js';

import { WorkflowStateService } from '../../workflow/workflow-state.service.js';

import { CashSettlementCalculationService } from '../../../../common/calculators/cash-settlement.calculator.js';

import { PrismaOrTransaction } from '../../../../types/transaction.types.js';

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
      throw new NotFoundException(CASH_SETTLEMENT_ERRORS.PAPER_NOT_FOUND);
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
}
