import { Injectable } from "@nestjs/common";
import { CashSettlementRepository } from "./cash-settlement.repository.js";
import { BankDepositRowDto, CashSettlementResponseDto, DirectCollectionRowDto, RouteDenominationRowDto, RouteExpenseRowDto, RouteSettlementRowDto } from "./dto/cash-settlement-response.dto.js";

@Injectable()
export class CashSettlementBuilder {

    buildCashSettlement(
        paper: NonNullable<
            Awaited<
                ReturnType<
                    CashSettlementRepository['getCashSettlementData']
                >
            >
        >,
    ): CashSettlementResponseDto {

        const routeSettlements: RouteSettlementRowDto[] =
            paper.order_sheet.map((sheet) => {

                const routeCash =
                    sheet.client_collection.reduce(
                        (sum, collection) =>
                            sum +
                            Number(collection.office_amount_given) +
                            Number(collection.cash_collection),
                        0,
                    );

                const expenseTotal =
                    sheet.cash_route_settlement?.expenses.reduce(
                        (sum, expense) =>
                            sum + Number(expense.amount),
                        0,
                    ) ?? 0;

                const routeNetCash =
                    routeCash - expenseTotal;

                const denominationTotal =
                    sheet.cash_route_settlement
                        ? this.getDenominationAmount(
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
            });


        const routeExpenses: RouteExpenseRowDto[] = [];

        for (const sheet of paper.order_sheet) {

            const settlement =
                sheet.cash_route_settlement;

            if (!settlement) {
                continue;
            }

            for (const expense of settlement.expenses) {

                routeExpenses.push({

                    id: expense.id,

                    sheetId: sheet.id,

                    routeName:
                        sheet.master_group.name,

                    expenseTypeId:
                        expense.expense_type_id,

                    expenseTypeName:
                        expense.expense_type.name,

                    amount:
                        Number(expense.amount),
                });
            }
        }


        const routeDenominations:
            RouteDenominationRowDto[] = [];

        for (const sheet of paper.order_sheet) {

            const settlement =
                sheet.cash_route_settlement;

            if (!settlement) {
                continue;
            }

            const denominationTotal =
                this.getDenominationAmount(
                    settlement,
                );

            routeDenominations.push({
                sheetId: sheet.id,

                routeName:
                    sheet.master_group.name,

                note2000:
                    settlement.note_2000,

                note500:
                    settlement.note_500,

                note200:
                    settlement.note_200,

                note100:
                    settlement.note_100,

                note50:
                    settlement.note_50,

                note20:
                    settlement.note_20,

                note10:
                    settlement.note_10,

                coins:
                    Number(settlement.coins),

                denominationTotal,
            });
        }

        const directCollections:
            DirectCollectionRowDto[] = [];

        for (
            const collection of
            paper.cash_direct_collections
        ) {

            const collectionAmount =
                this.getDenominationAmount(
                    collection,
                );

            directCollections.push({

                id: collection.id,

                employeeId:
                    collection.employee_id,

                employeeName:
                    collection.employee.name,

                note2000:
                    collection.note_2000,

                note500:
                    collection.note_500,

                note200:
                    collection.note_200,

                note100:
                    collection.note_100,

                note50:
                    collection.note_50,

                note20:
                    collection.note_20,

                note10:
                    collection.note_10,

                coins:
                    Number(collection.coins),

                collectionAmount,
            });
        }

        const bankDeposits: BankDepositRowDto[] = [];

        for (
            const deposit of
            paper.cash_bank_deposits
        ) {

            const depositAmount =
                this.getDenominationAmount(
                    deposit,
                );

            bankDeposits.push({

                id: deposit.id,

                bankId:
                    deposit.bank_id,

                bankName:
                    deposit.bank.name,

                note2000:
                    deposit.note_2000,

                note500:
                    deposit.note_500,

                note200:
                    deposit.note_200,

                note100:
                    deposit.note_100,

                note50:
                    deposit.note_50,

                note20:
                    deposit.note_20,

                note10:
                    deposit.note_10,

                coins:
                    Number(deposit.coins),

                depositAmount,
            });
        }
        const totalRouteCash =
            routeSettlements.reduce(
                (sum, row) =>
                    sum + row.routeCash,
                0,
            );

        const totalRouteExpenses =
            routeSettlements.reduce(
                (sum, row) =>
                    sum + row.expenseTotal,
                0,
            );

        const totalRouteNetCash =
            routeSettlements.reduce(
                (sum, row) =>
                    sum + row.routeNetCash,
                0,
            );

        const totalRouteDenominationCash =
            routeSettlements.reduce(
                (sum, row) =>
                    sum + row.denominationTotal,
                0,
            );

        const historicalDirectCollectionCash =
            directCollections.reduce(
                (sum, row) =>
                    sum + row.collectionAmount,
                0,
            );

        const revisedOfficeCash =
            totalRouteNetCash +
            historicalDirectCollectionCash;

        const totalDeposits =
            bankDeposits.reduce(
                (sum, row) =>
                    sum + row.depositAmount,
                0,
            );

        const historicalCashOnHand =
            totalRouteDenominationCash +
            historicalDirectCollectionCash -
            totalDeposits;

        const reconciliationDifference =
            revisedOfficeCash -
            historicalCashOnHand;

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

                totalRouteDenominationCash,
                historicalDirectCollectionCash,

                revisedOfficeCash,

                totalDeposits,

                historicalCashOnHand,

                reconciliationDifference,
            }
        };
    }

    private getDenominationAmount(row: {
        note_2000?: number | string | { toString(): string } | null;
        note_500?: number | string | { toString(): string } | null;
        note_200?: number | string | { toString(): string } | null;
        note_100?: number | string | { toString(): string } | null;
        note_50?: number | string | { toString(): string } | null;
        note_20?: number | string | { toString(): string } | null;
        note_10?: number | string | { toString(): string } | null;
        coins?: number | string | { toString(): string } | null;
    }): number {
        return (
            Number(row.note_2000 ?? 0) * 2000 +
            Number(row.note_500 ?? 0) * 500 +
            Number(row.note_200 ?? 0) * 200 +
            Number(row.note_100 ?? 0) * 100 +
            Number(row.note_50 ?? 0) * 50 +
            Number(row.note_20 ?? 0) * 20 +
            Number(row.note_10 ?? 0) * 10 +
            Number(row.coins ?? 0)
        );
    }
}


