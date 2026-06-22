import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { CashSettlementRepository }
    from './cash-settlement.repository.js';

import {
    CASH_SETTLEMENT_ERRORS,
    CASH_SETTLEMENT_VALIDATION_ERRORS,
} from './cash-settlement.constants.js';

import { OrderPaperStatus } from '../../generated/prisma/client.js';

type DenominationRow = {
    note_2000?: number | string | { toString(): string } | null;
    note_500?: number | string | { toString(): string } | null;
    note_200?: number | string | { toString(): string } | null;
    note_100?: number | string | { toString(): string } | null;
    note_50?: number | string | { toString(): string } | null;
    note_20?: number | string | { toString(): string } | null;
    note_10?: number | string | { toString(): string } | null;
    coins?: number | string | { toString(): string } | null;
};

type DenominationTotals = {
    note2000: number;
    note500: number;
    note200: number;
    note100: number;
    note50: number;
    note20: number;
    note10: number;
    coins: number;
};

@Injectable()
export class CashSettlementValidationService {

    constructor(
        private readonly cashSettlementRepository:
            CashSettlementRepository,
    ) { }

  async validateMorningSubmitReadiness(
    paperId: number,
): Promise<void> {

    const paper =
        await this.cashSettlementRepository
            .getCashSettlementData(
                paperId,
            );

    if (!paper) {
        throw new NotFoundException(
            CASH_SETTLEMENT_ERRORS
                .PAPER_NOT_FOUND,
        );
    }

   if (
    paper.status ===
    OrderPaperStatus.REOPENED
) {
    // After reopen, cash settlement is treated as historical.
    // Route denominations, direct collections, and bank deposits
    // remain frozen and are not revalidated against revised cash.
    // Route expenses may still be edited, but re-finalization does
    // not require cash-settlement reconciliation to match again.
    return;
}

    this.validateRouteDenominationsFromPaper(
        paper,
    );

    this.validateBankDepositsFromPaper(
        paper,
    );
}

    private validateRouteDenominationsFromPaper(
    paper: NonNullable<
        Awaited<
            ReturnType<
                CashSettlementRepository['getCashSettlementData']
            >
        >
    >,
): void {

    for (const sheet of paper.order_sheet) {

        const routeCash =
            sheet.client_collection.reduce(
                (
                    sum,
                    collection,
                ) =>
                    sum +
                    Number(
                        collection.office_amount_given,
                    ) +
                    Number(
                        collection.cash_collection,
                    ),
                0,
            );

        const expenseTotal =
            sheet.cash_route_settlement
                ?.expenses
                .reduce(
                    (
                        sum,
                        expense,
                    ) =>
                        sum +
                        Number(
                            expense.amount,
                        ),
                    0,
                ) ?? 0;

        const routeNetCash =
            routeCash - expenseTotal;

        const denominationTotal =
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_2000 ?? 0,
                ) * 2000
            ) +
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_500 ?? 0,
                ) * 500
            ) +
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_200 ?? 0,
                ) * 200
            ) +
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_100 ?? 0,
                ) * 100
            ) +
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_50 ?? 0,
                ) * 50
            ) +
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_20 ?? 0,
                ) * 20
            ) +
            (
                Number(
                    sheet.cash_route_settlement
                        ?.note_10 ?? 0,
                ) * 10
            ) +
            Number(
                sheet.cash_route_settlement
                    ?.coins ?? 0,
            );

        if (
            routeNetCash !==
            denominationTotal
        ) {
            throw new BadRequestException(
                CASH_SETTLEMENT_VALIDATION_ERRORS
                    .ROUTE_CASH_MISMATCH(
                        sheet.master_group.name,
                        routeNetCash,
                        denominationTotal,
                    ),
            );
        }
    }
}

    private validateBankDepositsFromPaper(
    paper: NonNullable<
        Awaited<
            ReturnType<
                CashSettlementRepository['getCashSettlementData']
            >
        >
    >,
): void {

    const totalRouteNetCash =
        paper.order_sheet.reduce(
            (total, sheet) => {

                const routeCash =
                    sheet.client_collection.reduce(
                        (
                            sum,
                            collection,
                        ) =>
                            sum +
                            Number(
                                collection.office_amount_given,
                            ) +
                            Number(
                                collection.cash_collection,
                            ),
                        0,
                    );

                const expenseTotal =
                    sheet.cash_route_settlement
                        ?.expenses
                        .reduce(
                            (
                                sum,
                                expense,
                            ) =>
                                sum +
                                Number(
                                    expense.amount,
                                ),
                            0,
                        ) ?? 0;

                return (
                    total +
                    routeCash -
                    expenseTotal
                );
            },
            0,
        );

    const directCollectionTotals =
        this.getDenominationTotals(
            paper.cash_direct_collections,
        );

    const depositTotals =
        this.getDenominationTotals(
            paper.cash_bank_deposits,
        );

    const totalDirectCollections =
        this.getDenominationAmount(
            directCollectionTotals,
        );

    const totalDeposits =
        this.getDenominationAmount(
            depositTotals,
        );

    const officeCash =
        totalRouteNetCash +
        totalDirectCollections;

    if (totalDeposits > officeCash) {
        throw new BadRequestException(
            CASH_SETTLEMENT_VALIDATION_ERRORS
                .BANK_DEPOSIT_EXCEEDS_CASH(
                    officeCash,
                    totalDeposits,
                ),
        );
    }

    const routeDenominationRows =
        paper.order_sheet
            .map(
                (sheet) =>
                    sheet.cash_route_settlement,
            )
            .filter(
                (
                    settlement,
                ): settlement is NonNullable<
                    typeof settlement
                > => settlement !== null,
            );

    const routeDenominationTotals =
        this.getDenominationTotals(
            routeDenominationRows,
        );

    const availableDenominations = {
        note2000:
            routeDenominationTotals.note2000 +
            directCollectionTotals.note2000,

        note500:
            routeDenominationTotals.note500 +
            directCollectionTotals.note500,

        note200:
            routeDenominationTotals.note200 +
            directCollectionTotals.note200,

        note100:
            routeDenominationTotals.note100 +
            directCollectionTotals.note100,

        note50:
            routeDenominationTotals.note50 +
            directCollectionTotals.note50,

        note20:
            routeDenominationTotals.note20 +
            directCollectionTotals.note20,

        note10:
            routeDenominationTotals.note10 +
            directCollectionTotals.note10,

        coins:
            routeDenominationTotals.coins +
            directCollectionTotals.coins,
    };

    const denominationChecks = [
        [
            '₹2000',
            depositTotals.note2000,
            availableDenominations.note2000,
        ],
        [
            '₹500',
            depositTotals.note500,
            availableDenominations.note500,
        ],
        [
            '₹200',
            depositTotals.note200,
            availableDenominations.note200,
        ],
        [
            '₹100',
            depositTotals.note100,
            availableDenominations.note100,
        ],
        [
            '₹50',
            depositTotals.note50,
            availableDenominations.note50,
        ],
        [
            '₹20',
            depositTotals.note20,
            availableDenominations.note20,
        ],
        [
            '₹10',
            depositTotals.note10,
            availableDenominations.note10,
        ],
        [
            'coins',
            depositTotals.coins,
            availableDenominations.coins,
        ],
    ] as const;

    for (
        const [
            label,
            deposited,
            available,
        ] of denominationChecks
    ) {
        if (deposited > available) {
            throw new BadRequestException(
                `Bank deposit ${label} count exceeds available cash. Available: ${available}, Deposited: ${deposited}`,
            );
        }
    }
}

    private getDenominationTotals(
        rows: DenominationRow[],
    ): DenominationTotals {

        return rows.reduce<DenominationTotals>(
            (
                totals,
                row,
            ) => {
                totals.note2000 += Number(
                    row.note_2000 ?? 0,
                );

                totals.note500 += Number(
                    row.note_500 ?? 0,
                );

                totals.note200 += Number(
                    row.note_200 ?? 0,
                );

                totals.note100 += Number(
                    row.note_100 ?? 0,
                );

                totals.note50 += Number(
                    row.note_50 ?? 0,
                );

                totals.note20 += Number(
                    row.note_20 ?? 0,
                );

                totals.note10 += Number(
                    row.note_10 ?? 0,
                );

                totals.coins += Number(
                    row.coins ?? 0,
                );

                return totals;
            },
            {
                note2000: 0,
                note500: 0,
                note200: 0,
                note100: 0,
                note50: 0,
                note20: 0,
                note10: 0,
                coins: 0,
            },
        );
    }

    private getDenominationAmount(
        totals: DenominationTotals,
    ): number {

        return (
            totals.note2000 * 2000 +
            totals.note500 * 500 +
            totals.note200 * 200 +
            totals.note100 * 100 +
            totals.note50 * 50 +
            totals.note20 * 20 +
            totals.note10 * 10 +
            totals.coins
        );
    }
}