import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';

import { NightCollectionEntryDto } from './dto/save-night-collection.dto.js';
import { MorningCollectionEntryDto } from './dto/save-morning-collection.dto.js';
import { AdminCollectionEntryDto } from './dto/save-admin-collection.dto.js';

import { Prisma, SupplyCategory } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderSheetById(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.findUnique({
      where: {
        id: sheetId,
      },

      include: {
        master_group: true,
        order_paper: true,
      },
    });
  }

  async getClientsByGroupAndCategory(
    groupId: number,
    category: SupplyCategory,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.master_client.findMany({
      where: {
        delivery_group_id: groupId,
        is_active: true,
        categories: {
          some: {
            category,
          },
        },
      },

      orderBy: {
        code: 'asc',
      },
    });
  }

  async getCollectionsForValidation(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.client_collection.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      select: {
        office_amount_given: true,
        cash_collection: true,
        cheque_collection: true,
        online_collection: true,
        bank_deposit: true,
      },
    });
  }

  async getCollectionEntries(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.client_collection.findMany({
      where: {
        order_sheet_id: sheetId,
      },
    });
  }

  async replaceNightCollections(
    sheetId: number,
    category: SupplyCategory,
    entries: NightCollectionEntryDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (entries.length === 0) return;

    const values = Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${sheetId}, ${e.clientId}, ${category}::"SupplyCategory", ${e.officeAmountGiven}, now(), now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO client_collection
      (order_sheet_id, client_id, category, office_amount_given, created_at, updated_at)
    VALUES ${values}
    ON CONFLICT (order_sheet_id, client_id, category)
    DO UPDATE SET office_amount_given = EXCLUDED.office_amount_given,
                  updated_at = EXCLUDED.updated_at
  `);
  }

  async replaceMorningCollections(
    sheetId: number,
    category: SupplyCategory,
    entries: MorningCollectionEntryDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (entries.length === 0) return;

    const values = Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${sheetId}, ${e.clientId}, ${category}::"SupplyCategory", ${e.cashCollection}, ${e.chequeCollection}, ${e.employeeRemarks ?? null}, now(), now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO client_collection
      (order_sheet_id, client_id, category, cash_collection, cheque_collection, employee_remarks, created_at, updated_at)
    VALUES ${values}
    ON CONFLICT (order_sheet_id, client_id, category)
    DO UPDATE SET cash_collection = EXCLUDED.cash_collection,
                  cheque_collection = EXCLUDED.cheque_collection,
                  employee_remarks = EXCLUDED.employee_remarks,
                  updated_at = EXCLUDED.updated_at
  `);
  }

  async replaceAdminCollections(
    sheetId: number,
    category: SupplyCategory,
    entries: AdminCollectionEntryDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (entries.length === 0) return;

    const values = Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${sheetId}, ${e.clientId}, ${category}::"SupplyCategory", ${e.onlineCollection}, ${e.bankDeposit}, ${e.adminRemarks ?? null}, now(), now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO client_collection
      (order_sheet_id, client_id, category, online_collection, bank_deposit, admin_remarks, created_at, updated_at)
    VALUES ${values}
    ON CONFLICT (order_sheet_id, client_id, category)
    DO UPDATE SET online_collection = EXCLUDED.online_collection,
                  bank_deposit = EXCLUDED.bank_deposit,
                  admin_remarks = EXCLUDED.admin_remarks,
                  updated_at = EXCLUDED.updated_at
  `);
  }

  async getClientsForCollectionDisplay(
    sheetId: number,
    groupId: number,
    category: SupplyCategory,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const [eligible, historicallyReferenced] = await Promise.all([
      this.getClientsByGroupAndCategory(groupId, category, db),
      db.master_client.findMany({
        where: {
          client_collection: {
            some: { order_sheet_id: sheetId, category },
          },
        },
      }),
    ]);

    const byId = new Map(eligible.map((c) => [c.id, c]));
    for (const c of historicallyReferenced) byId.set(c.id, c);
    return Array.from(byId.values()).sort(
      (a, b) => a.code?.localeCompare(b.code ?? '') ?? 0,
    );
  }

async touchCollectionsIfUnchanged(
  sheetId: number,
  expectedUpdatedAt: Date | null,
  db: PrismaOrTransaction = this.prisma,
) {
  return db.order_sheet.updateMany({
    where: {
      id: sheetId,
      ...(expectedUpdatedAt !== null && { collections_updated_at: expectedUpdatedAt }),
    },
    data: { collections_updated_at: new Date() },
  });
}
}
