import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CashSettlementRepository }
    from './cash-settlement.repository.js';

import { CashSettlementBuilder }
    from './cash-settlement.builder.js';

import {
    SaveRouteExpensesDto,
} from './dto/save-route-expense.dto.js';
import { SaveRouteDenominationsDto } from './dto/save-route-denominations.dto.js';

import {
    SaveDirectCollectionsDto,
} from './dto/save-direct-collections.dto.js';
import { SaveBankDepositsDto } from './dto/save-bank-deposit.dto.js';
import { WorkflowStateService }
    from '../workflow/workflow-state.service.js';

import {
    CASH_SETTLEMENT_ERRORS,
} from './cash-settlement.constants.js';
@Injectable()
export class CashSettlementService {

    constructor(
        private readonly repository:
            CashSettlementRepository,

        private readonly builder:
            CashSettlementBuilder,

        private readonly workflowStateService:
            WorkflowStateService,
    ) { }

    async getCashSettlementService(
        paperId: number,
    ) {
        const paper =
            await this.getCashSettlementPaper(
                paperId,
            );

        return this.builder
            .buildCashSettlement(
                paper,
            );
    }

    async saveRouteExpensesService(
        paperId: number,
        dto: SaveRouteExpensesDto,
    ) {

        await this.validateRouteExpenseEditing(paperId);

        const expensesBySheet =
            new Map<
                number,
                typeof dto.expenses
            >();


        for (
            const expense of dto.expenses
        ) {

            const existing =
                expensesBySheet.get(
                    expense.sheetId,
                ) ?? [];

            existing.push(
                expense,
            );

            expensesBySheet.set(
                expense.sheetId,
                existing,
            );
        }

        for (
            const [
                sheetId,
                expenses,
            ] of expensesBySheet
        ) {

            await this.repository
                .replaceRouteExpenses(
                    sheetId,
                    expenses,
                );
        }
        return {
            success: true,
        };
    }

    async saveRouteDenominationsService(
        paperId: number,
        dto: SaveRouteDenominationsDto,
    ) {

        await this.validateRouteDenominationEditing(paperId);

        for (
            const denomination of
            dto.denominations
        ) {

            await this.repository
                .saveRouteDenomination(
                    denomination,
                );
        }

        return {
            success: true,
        };
    }

    async saveDirectCollectionsService(
        paperId: number,
        dto: SaveDirectCollectionsDto,
    ) {

        await this.validateDirectCollectionEditing(paperId);

        await this.repository
            .replaceDirectCollections(
                paperId,
                dto.directCollections,
            );

        return {
            success: true,
        };
    }

    async saveBankDepositsService(
        paperId: number,
        dto: SaveBankDepositsDto,
    ) {

        await this.validateBankDepositEditing(paperId);

        await this.repository
            .replaceBankDeposits(
                paperId,
                dto.bankDeposits,
            );

        return {
            success: true,
        };
    }

    private async getCashSettlementPaper(
        paperId: number,
    ) {
        const paper =
            await this.repository
                .getCashSettlementData(
                    paperId,
                );

        if (!paper) {
            throw new NotFoundException(
                CASH_SETTLEMENT_ERRORS
                    .PAPER_NOT_FOUND,
            );
        }

        return paper;
    }

    private async validateRouteExpenseEditing(
        paperId: number,
    ) {
        const paper =
            await this.getCashSettlementPaper(
                paperId,
            );

        if (
            !this.workflowStateService
                .canEditRouteExpenses(
                    paper.status,
                )
        ) {
            throw new BadRequestException(
                CASH_SETTLEMENT_ERRORS
                    .EDITING_NOT_ALLOWED,
            );
        }

        return paper;
    }

    private async validateRouteDenominationEditing(
        paperId: number,
    ) {
        const paper =
            await this.getCashSettlementPaper(
                paperId,
            );

        if (
            !this.workflowStateService
                .canEditRouteDenominations(
                    paper.status,
                )
        ) {
            throw new BadRequestException(
                CASH_SETTLEMENT_ERRORS
                    .EDITING_NOT_ALLOWED,
            );
        }

        return paper;
    }

    private async validateDirectCollectionEditing(
        paperId: number,
    ) {
        const paper =
            await this.getCashSettlementPaper(
                paperId,
            );

        if (
            !this.workflowStateService
                .canEditDirectCollections(
                    paper.status,
                )
        ) {
            throw new BadRequestException(
                CASH_SETTLEMENT_ERRORS
                    .EDITING_NOT_ALLOWED,
            );
        }

        return paper;
    }

    private async validateBankDepositEditing(
        paperId: number,
    ) {
        const paper =
            await this.getCashSettlementPaper(
                paperId,
            );

        if (
            !this.workflowStateService
                .canEditBankDeposits(
                    paper.status,
                )
        ) {
            throw new BadRequestException(
                CASH_SETTLEMENT_ERRORS
                    .EDITING_NOT_ALLOWED,
            );
        }

        return paper;
    }


}