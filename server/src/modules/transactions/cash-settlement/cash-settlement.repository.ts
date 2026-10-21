import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { RouteExpenseDto } from './dto/save-route-expense.dto.js';
import { RouteDenominationDto } from './dto/save-route-denominations.dto.js';
import { DirectCollectionDto } from './dto/save-direct-collections.dto.js';
import { BankDepositDto } from './dto/save-bank-deposit.dto.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { touchIfTokenMatches } from '../../../common/prisma/touch-if-unchanged.util.js';
import { toDecimal, toMoney } from '../../../common/utils/money.util.js';

// CS-10.5: every section first PLANS its changes (pure, nothing written) so the
// service can skip the token advance when there is nothing to change.
export type ExpenseChangeSet = {
  deletedIds: number[];
  updates: { id: number; expenseTypeId: number; amount: number }[];
  inserts: { sheetId: number; expenseTypeId: number; amount: number }[];
  changed: boolean;
};

export type DenominationChangeSet = {
  toSave: RouteDenominationDto[];
  changed: boolean;
};

export type DirectCollectionChangeSet = {
  removeEmployeeIds: number[];
  updates: { id: number; data: Record<string, number> }[];
  inserts: Prisma.cash_direct_collectionCreateManyInput[];
  changed: boolean;
};

export type BankDepositChangeSet = {
  deletedIds: number[];
  updates: BankDepositDto[];
  inserts: BankDepositDto[];
  changed: boolean;
};

type StoredAmounts = {
  note_2000: number;
  note_500: number;
  note_200: number;
  note_100: number;
  note_50: number;
  note_20: number;
  note_10: number;
  coins: unknown;
};

type IncomingAmounts = {
  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;
  coins: number;
};

function sameAmounts(stored: StoredAmounts, c: IncomingAmounts): boolean {
  return (
    stored.note_2000 === c.note2000 &&
    stored.note_500 === c.note500 &&
    stored.note_200 === c.note200 &&
    stored.note_100 === c.note100 &&
    stored.note_50 === c.note50 &&
    stored.note_20 === c.note20 &&
    stored.note_10 === c.note10 &&
    Number(stored.coins) === toMoney(toDecimal(c.coins))
  );
}

// CS-7.3 / CS-8.4: an all-zero entry with no stored row creates nothing.
function isAllZero(c: IncomingAmounts): boolean {
  return (
    c.note2000 === 0 &&
    c.note500 === 0 &&
    c.note200 === 0 &&
    c.note100 === 0 &&
    c.note50 === 0 &&
    c.note20 === 0 &&
    c.note10 === 0 &&
    toMoney(toDecimal(c.coins)) === 0
  );
}

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
                is_active: true,
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

  // Light read used by the in-transaction status and token checks (CS-2.2).
  async getPaperHeader(paperId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_paper.findUnique({
      where: { id: paperId },
      select: { id: true, status: true, updated_at: true },
    });
  }

  // ---------------------------------------------------------------------
  // Route expenses (CS-6)
  // ---------------------------------------------------------------------

  async findExpensesForPaper(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.cash_route_expense.findMany({
      where: {
        route_settlement: { order_sheet: { order_paper_id: paperId } },
      },
      include: {
        route_settlement: { select: { order_sheet_id: true } },
      },
    });
  }

  /**
   * CS-6.2 / CS-6.3: record-level patch. A line with an id is updated in place
   * (only if the type or amount changed), a line without one is added, and only
   * the ids in deletedIds are removed. Nothing is deleted by omission.
   */
  planExpenseChanges(
    expenses: RouteExpenseDto[],
    deletedIds: number[],
    existing: Awaited<
      ReturnType<CashSettlementRepository['findExpensesForPaper']>
    >,
  ): ExpenseChangeSet {
    const existingById = new Map(existing.map((e) => [e.id, e]));
    const updates: ExpenseChangeSet['updates'] = [];
    const inserts: ExpenseChangeSet['inserts'] = [];

    for (const e of expenses) {
      if (e.id == null) {
        inserts.push({
          sheetId: e.sheetId,
          expenseTypeId: e.expenseTypeId,
          amount: e.amount,
        });
        continue;
      }

      const stored = existingById.get(e.id)!;
      if (
        stored.expense_type_id !== e.expenseTypeId ||
        Number(stored.amount) !== toMoney(toDecimal(e.amount))
      ) {
        updates.push({
          id: e.id,
          expenseTypeId: e.expenseTypeId,
          amount: e.amount,
        });
      }
    }

    return {
      deletedIds,
      updates,
      inserts,
      changed: deletedIds.length + updates.length + inserts.length > 0,
    };
  }

  async applyExpenseChanges(
    changes: ExpenseChangeSet,
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (changes.deletedIds.length > 0) {
      await db.cash_route_expense.deleteMany({
        where: { id: { in: changes.deletedIds } },
      });
    }
    for (const u of changes.updates) {
      await db.cash_route_expense.update({
        where: { id: u.id },
        data: { expense_type_id: u.expenseTypeId, amount: u.amount },
      });
    }

    if (changes.inserts.length > 0) {
      // CS-6.5: a settlement record is created only for a route that receives a
      // new expense line (the line needs a parent record).
      const settlementBySheet = new Map<number, number>();
      for (const sheetId of new Set(changes.inserts.map((i) => i.sheetId))) {
        const settlement = await db.cash_route_settlement.upsert({
          where: { order_sheet_id: sheetId },
          update: {},
          create: { order_sheet_id: sheetId },
        });
        settlementBySheet.set(sheetId, settlement.id);
      }

      await db.cash_route_expense.createMany({
        data: changes.inserts.map((i) => ({
          cash_route_settlement_id: settlementBySheet.get(i.sheetId)!,
          expense_type_id: i.expenseTypeId,
          amount: i.amount,
        })),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Route denominations (CS-7)
  // ---------------------------------------------------------------------

  async findRouteSettlements(
    sheetIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (sheetIds.length === 0) return [];
    return db.cash_route_settlement.findMany({
      where: { order_sheet_id: { in: sheetIds } },
    });
  }

  planDenominationChanges(
    denominations: RouteDenominationDto[],
    existing: Awaited<
      ReturnType<CashSettlementRepository['findRouteSettlements']>
    >,
  ): DenominationChangeSet {
    const existingBySheet = new Map(existing.map((s) => [s.order_sheet_id, s]));
    const toSave: RouteDenominationDto[] = [];

    for (const d of denominations) {
      const stored = existingBySheet.get(d.sheetId);
      if (!stored) {
        if (!isAllZero(d)) toSave.push(d);
        continue;
      }
      if (!sameAmounts(stored, d)) toSave.push(d);
    }

    return { toSave, changed: toSave.length > 0 };
  }

  async applyDenominationChanges(
    changes: DenominationChangeSet,
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (const denomination of changes.toSave) {
      await this.saveRouteDenomination(denomination, db);
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

  // ---------------------------------------------------------------------
  // Direct collections (CS-8)
  // ---------------------------------------------------------------------

  async findDirectCollections(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.cash_direct_collection.findMany({
      where: { order_paper_id: paperId },
    });
  }

  /**
   * CS-8.3 / CS-8.4: employees not in the payload are untouched. Removal is
   * explicit (deletedEmployeeIds) or happens when an employee is sent with all
   * zeros. An all-zero employee with no stored row creates nothing.
   */
  planDirectCollectionChanges(
    paperId: number,
    existing: Awaited<
      ReturnType<CashSettlementRepository['findDirectCollections']>
    >,
    collections: DirectCollectionDto[],
    deletedEmployeeIds: number[],
  ): DirectCollectionChangeSet {
    const existingByEmployee = new Map(existing.map((r) => [r.employee_id, r]));
    const removeEmployeeIds = new Set(deletedEmployeeIds);
    const inserts: DirectCollectionChangeSet['inserts'] = [];
    const updates: DirectCollectionChangeSet['updates'] = [];

    for (const c of collections) {
      const stored = existingByEmployee.get(c.employeeId);

      if (isAllZero(c)) {
        if (stored) removeEmployeeIds.add(c.employeeId);
        continue;
      }

      const amounts = {
        note_2000: c.note2000,
        note_500: c.note500,
        note_200: c.note200,
        note_100: c.note100,
        note_50: c.note50,
        note_20: c.note20,
        note_10: c.note10,
        coins: c.coins,
      };

      if (!stored) {
        inserts.push({
          order_paper_id: paperId,
          employee_id: c.employeeId,
          ...amounts,
        });
        continue;
      }

      if (!sameAmounts(stored, c)) {
        updates.push({ id: stored.id, data: amounts });
      }
    }

    return {
      removeEmployeeIds: [...removeEmployeeIds],
      updates,
      inserts,
      changed: removeEmployeeIds.size + updates.length + inserts.length > 0,
    };
  }

  async applyDirectCollectionChanges(
    paperId: number,
    changes: DirectCollectionChangeSet,
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (changes.removeEmployeeIds.length > 0) {
      await db.cash_direct_collection.deleteMany({
        where: {
          order_paper_id: paperId,
          employee_id: { in: changes.removeEmployeeIds },
        },
      });
    }
    for (const u of changes.updates) {
      await db.cash_direct_collection.update({
        where: { id: u.id },
        data: u.data,
      });
    }
    if (changes.inserts.length > 0) {
      await db.cash_direct_collection.createMany({ data: changes.inserts });
    }
  }

  // ---------------------------------------------------------------------
  // Bank deposits (CS-9)
  // ---------------------------------------------------------------------

  async findBankDeposits(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.cash_bank_deposit.findMany({
      where: { order_paper_id: paperId },
    });
  }

  /**
   * CS-9.2 / CS-9.3: a deposit with an id is updated (only if something
   * changed), one without is added, and only the ids in deletedIds are removed.
   * Ids are validated by the caller.
   */
  planBankDepositChanges(
    existing: Awaited<ReturnType<CashSettlementRepository['findBankDeposits']>>,
    deposits: BankDepositDto[],
    deletedIds: number[],
  ): BankDepositChangeSet {
    const existingById = new Map(existing.map((d) => [d.id, d]));

    const inserts = deposits.filter((d) => d.id == null);
    const updates = deposits.filter((d) => {
      if (d.id == null) return false;
      const stored = existingById.get(d.id)!;
      return stored.bank_id !== d.bankId || !sameAmounts(stored, d);
    });

    return {
      deletedIds,
      updates,
      inserts,
      changed: deletedIds.length + updates.length + inserts.length > 0,
    };
  }

  async applyBankDepositChanges(
    paperId: number,
    changes: BankDepositChangeSet,
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (changes.deletedIds.length > 0) {
      await db.cash_bank_deposit.deleteMany({
        where: { order_paper_id: paperId, id: { in: changes.deletedIds } },
      });
    }

    for (const deposit of changes.updates) {
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

    if (changes.inserts.length > 0) {
      await db.cash_bank_deposit.createMany({
        data: changes.inserts.map((deposit) => ({
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

  // ---------------------------------------------------------------------
  // Concurrency token (CS-10): the paper's updated_at, compare-and-advance,
  // using the same clock-safe helper as the other modules.
  // ---------------------------------------------------------------------

  async touchOrderPaperIfTokenMatches(
    paperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
      db.order_paper,
      { id: paperId },
      'updated_at',
      expectedUpdatedAt,
    );
  }
}
