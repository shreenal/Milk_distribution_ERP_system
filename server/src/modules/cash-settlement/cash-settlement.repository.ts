import { Injectable } from '@nestjs/common';

import { PrismaService }
    from '../../prisma/prisma.service.js';
import { RouteExpenseDto } from './dto/save-route-expense.dto.js';
import { RouteDenominationDto } from './dto/save-route-denominations.dto.js';
import { DirectCollectionDto } from './dto/save-direct-collections.dto.js';
import { BankDepositDto } from './dto/save-bank-deposit.dto.js';

@Injectable()
export class CashSettlementRepository {

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    async getCashSettlementData(
        paperId: number,
    ) {

        return this.prisma.order_paper.findUnique({
            where: {
                id: paperId,
            },
            include: {

                order_sheet: {
                    include: {

                        master_group: true,

                        client_collection: true,

                        cash_route_settlement: {
                            include: {
                                expenses: {
                                    include: {
                                        expense_type: true,
                                    },
                                },
                            },
                        },
                    },
                },

                cash_direct_collections: {
                    include: {
                        employee: true,
                    },
                },

                cash_bank_deposits: {
                    include: {
                        bank: true,
                    },
                },
            },
        });
    }

    async replaceRouteExpenses(
        sheetId: number,
        expenses: RouteExpenseDto[],
    ) {
        await this.prisma.$transaction(async (tx) => {
            let settlement = await tx.cash_route_settlement.findUnique({
                where: { order_sheet_id: sheetId },
            });

            if (!settlement) {
                settlement = await tx.cash_route_settlement.create({
                    data: {
                        order_sheet_id: sheetId,
                        note_2000: 0,
                        note_500: 0,
                        note_200: 0,
                        note_100: 0,
                        note_50: 0,
                        note_20: 0,
                        note_10: 0,
                        coins: 0,
                    },
                });
            }

            await tx.cash_route_expense.deleteMany({
                where: {
                    cash_route_settlement_id: settlement.id,
                },
            });

            if (expenses.length > 0) {
                await tx.cash_route_expense.createMany({
                    data: expenses.map((expense) => ({
                        cash_route_settlement_id: settlement.id,
                        expense_type_id: expense.expenseTypeId,
                        amount: expense.amount,
                    })),
                });
            }
        });
    }

    async saveRouteDenomination(
        denomination: RouteDenominationDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            let settlement = await tx.cash_route_settlement.findUnique({
                where: {
                    order_sheet_id: denomination.sheetId,
                },
            });

            if (!settlement) {
                settlement = await tx.cash_route_settlement.create({
                    data: {
                        order_sheet_id: denomination.sheetId,
                        note_2000: 0,
                        note_500: 0,
                        note_200: 0,
                        note_100: 0,
                        note_50: 0,
                        note_20: 0,
                        note_10: 0,
                        coins: 0,
                    },
                });
            }

            return tx.cash_route_settlement.update({
                where: {
                    id: settlement.id,
                },
                data: {
                    note_2000: denomination.note2000,
                    note_500: denomination.note500,
                    note_200: denomination.note200,
                    note_100: denomination.note100,
                    note_50: denomination.note50,
                    note_20: denomination.note20,
                    note_10: denomination.note10,
                    coins: denomination.coins,
                },
            });
        });
    }

    async replaceDirectCollections(
        paperId: number,
        collections: DirectCollectionDto[],
    ) {
        await this.prisma.$transaction(async (tx) => {
            await tx.cash_direct_collection.deleteMany({
                where: {
                    order_paper_id: paperId,
                },
            });

            if (collections.length > 0) {
                await tx.cash_direct_collection.createMany({
                    data: collections.map((collection) => ({
                        order_paper_id: paperId,
                        employee_id: collection.employeeId,
                        note_2000: collection.note2000,
                        note_500: collection.note500,
                        note_200: collection.note200,
                        note_100: collection.note100,
                        note_50: collection.note50,
                        note_20: collection.note20,
                        note_10: collection.note10,
                        coins: collection.coins,
                    })),
                });
            }
        });
    }


    async replaceBankDeposits(
        paperId: number,
        deposits: BankDepositDto[],
    ) {
        await this.prisma.$transaction(async (tx) => {
            await tx.cash_bank_deposit.deleteMany({
                where: {
                    order_paper_id: paperId,
                },
            });

            if (deposits.length > 0) {
                await tx.cash_bank_deposit.createMany({
                    data: deposits.map((deposit) => ({
                        order_paper_id: paperId,
                        bank_id: deposit.bankId,
                        note_2000: deposit.note2000,
                        note_500: deposit.note500,
                        note_200: deposit.note200,
                        note_100: deposit.note100,
                        note_50: deposit.note50,
                        note_20: deposit.note20,
                        note_10: deposit.note10,
                        coins: deposit.coins,
                    })),
                });
            }
        });
    }
}