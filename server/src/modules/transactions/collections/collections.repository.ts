import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';

import { Prisma, SupplyCategory } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { touchIfTokenMatches } from '../../../common/prisma/touch-if-unchanged.util.js';

// CD-3.6: clients are ordered by code, then by name. A client without a code
// sorts after every client that has one (ties broken by name).
function compareClients(
  a: { code: string | null; name: string },
  b: { code: string | null; name: string },
): number {
  if (a.code !== b.code) {
    if (a.code === null) return 1;
    if (b.code === null) return -1;
    const byCode = a.code.localeCompare(b.code);
    if (byCode !== 0) return byCode;
  }
  return a.name.localeCompare(b.name);
}

export type AmountColumn =
  | 'office_cash_collection'
  | 'cash_collection'
  | 'cheque_collection'
  | 'online_collection'
  | 'bank_deposit';

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

      orderBy: [{ code: 'asc' }, { name: 'asc' }],
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
        office_cash_collection: true,
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

  /** Rows that already exist for these clients on this sheet + category. */
  async getCollectionsForClients(
    sheetId: number,
    category: SupplyCategory,
    clientIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.client_collection.findMany({
      where: {
        order_sheet_id: sheetId,
        category,
        client_id: { in: clientIds },
      },
    });
  }

  /**
   * Bulk upsert on the unique key (sheet, client, category): the same
   * INSERT ... ON CONFLICT pattern Orders and Client Trays use. Only the
   * columns of one phase are written (`columns` is a closed union supplied by
   * the service, never user input), so a phase can never overwrite another
   * phase's amounts. Rows not in `rows` are not touched and nothing is deleted.
   */
  async upsertCollections(
    sheetId: number,
    category: SupplyCategory,
    columns: AmountColumn[],
    rows: { clientId: number; values: Partial<Record<AmountColumn, number>> }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (rows.length === 0) return;

    const identifier = (c: AmountColumn) => Prisma.raw(`"${c}"`);
    const columnList = Prisma.join(columns.map(identifier));

    const values = Prisma.join(
      rows.map(
        (r) =>
          Prisma.sql`(${sheetId}, ${r.clientId}, ${category}::"SupplyCategory", ${Prisma.join(
            columns.map((c) => r.values[c] ?? 0),
          )}, (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC'))`,
      ),
    );

    const updates = Prisma.join(
      columns.map(
        (c) => Prisma.sql`${identifier(c)} = EXCLUDED.${identifier(c)}`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
      INSERT INTO client_collection
        (order_sheet_id, client_id, category, ${columnList}, created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (order_sheet_id, client_id, category)
      DO UPDATE SET ${updates}, updated_at = EXCLUDED.updated_at
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
    return Array.from(byId.values()).sort(compareClients);
  }

  // CD-9: compare-and-advance on the sheet's concurrency token. A null
  // `expected` matches only a sheet whose token has never been set.
  async touchCollectionsIfTokenMatches(
    sheetId: number,
    expectedUpdatedAt: Date | null,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
      db.order_sheet,
      { id: sheetId },
      'collections_updated_at',
      expectedUpdatedAt,
    );
  }
}
