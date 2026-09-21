import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { RouteExpenseDto } from './dto/save-route-expense.dto.js';
import { RouteDenominationDto } from './dto/save-route-denominations.dto.js';
import { DirectCollectionDto } from './dto/save-direct-collections.dto.js';
import { BankDepositDto } from './dto/save-bank-deposit.dto.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';

@Injectable()
export class CashSettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCashSettlementData(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findUnique({
      where: {
        id: paperId,
      },
      include: {
        order_sheet: {
          include: {
            master_group: {
              select: {
                id: true,
                name: true,
                delivery_session: true,
              },
            },

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
    db: PrismaOrTransaction = this.prisma,
  ) {
    const settlement = await db.cash_route_settlement.upsert({
      where: { order_sheet_id: sheetId },
      update: {},
      create: {
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
    await db.cash_route_expense.deleteMany({
      where: { cash_route_settlement_id: settlement.id },
    });
    if (expenses.length > 0) {
      await db.cash_route_expense.createMany({
        data: expenses.map((e) => ({
          cash_route_settlement_id: settlement.id,
          expense_type_id: e.expenseTypeId,
          amount: e.amount,
        })),
      });
    }
  }

  async saveRouteDenomination(
    denomination: RouteDenominationDto,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.cash_route_settlement.upsert({
      where: { order_sheet_id: denomination.sheetId },
      update: {
        note_2000: denomination.note2000,
        note_500: denomination.note500,
        note_200: denomination.note200,
        note_100: denomination.note100,
        note_50: denomination.note50,
        note_20: denomination.note20,
        note_10: denomination.note10,
        coins: denomination.coins,
      },
      create: {
        order_sheet_id: denomination.sheetId,
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
  }

  async replaceDirectCollections(
    paperId: number,
    collections: DirectCollectionDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    await db.cash_direct_collection.deleteMany({
      where: {
        order_paper_id: paperId,
      },
    });

    if (collections.length > 0) {
      await db.cash_direct_collection.createMany({
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
  }

  async replaceBankDeposits(
    paperId: number,
    deposits: BankDepositDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const existing = await db.cash_bank_deposit.findMany({
      where: { order_paper_id: paperId },
    });

    const existingById = new Map(existing.map((r) => [r.id, r]));
    const incomingIds = new Set(
      deposits.filter((d) => d.id !== undefined).map((d) => d.id!),
    );

    // Any existing row not referenced by id in the incoming payload is gone.
    const toDelete = existing.filter((r) => !incomingIds.has(r.id));

    // No id = new deposit. An id present but not matching any existing row
    // for this paper is a client error (stale/foreign id), not silently
    // treated as new.
    const toInsert = deposits.filter((d) => d.id === undefined);
    const toUpdate = deposits.filter((d) => d.id !== undefined);

    const invalidIds = toUpdate
      .map((d) => d.id!)
      .filter((id) => !existingById.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Bank deposit id(s) ${invalidIds.join(', ')} do not belong to paper ${paperId}`,
      );
    }

    if (toDelete.length > 0) {
      await db.cash_bank_deposit.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }

    for (const deposit of toUpdate) {
      await db.cash_bank_deposit.update({
        where: { id: deposit.id! },
        data: {
          bank_id: deposit.bankId,
          note_2000: deposit.note2000,
          note_500: deposit.note500,
          note_200: deposit.note200,
          note_100: deposit.note100,
          note_50: deposit.note50,
          note_20: deposit.note20,
          note_10: deposit.note10,
          coins: deposit.coins,
        },
      });
    }

    if (toInsert.length > 0) {
      await db.cash_bank_deposit.createMany({
        data: toInsert.map((deposit) => ({
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
  }
}
