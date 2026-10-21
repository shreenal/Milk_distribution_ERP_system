import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  PrismaOrTransaction,
  TrayTransactionEntry,
} from '../../../types/transaction.types.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { touchIfTokenMatches } from '../../../common/prisma/touch-if-unchanged.util.js';
import { buildClientTrayKey } from '../../../common/utils/client-tray-key.util.js';

@Injectable()
export class ClientTraysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getSheetsByPaperId(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.findMany({
      where: {
        order_paper_id: paperId,
      },
      select: {
        id: true,
      },
      // The chunked forward propagation resumes by position in this list, so
      // the order must be the same on every run.
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findSheetById(sheetId: number, db: PrismaOrTransaction = this.prisma) {
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

  async getClientsByGroupId(
    groupId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.master_client.findMany({
      where: {
        delivery_group_id: groupId,

        is_active: true,
      },

      orderBy: {
        name: 'asc',
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
        name: 'asc',
      },
    });
  }

  /**
   * Decisions 8 and 14: tray visibility follows the ledger, not the client's
   * current status or group, so clients are looked up by id regardless of
   * is_active.
   */
  async getClientsByIds(
    clientIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (clientIds.length === 0) return [];

    return db.master_client.findMany({
      where: { id: { in: clientIds } },
      orderBy: { name: 'asc' },
    });
  }

  async getSheetItems(sheetId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      include: {
        master_product: {
          include: {
            master_brand: true,

            master_product_group: true,

            master_product_type: true,

            master_packaging_type: true,
          },
        },

        master_client: true,
      },
    });
  }

  async getProductTrayRules(db: PrismaOrTransaction = this.prisma) {
    return db.product_tray_rule.findMany({
      where: {
        is_active: true,
      },

      include: {
        master_tray_type: {
          include: {
            master_brand: true,
          },
        },

        master_brand: true,

        master_product_group: true,

        master_product_type: true,

        master_packaging_type: true,
      },
    });
  }

  async getTrayTypes(db: PrismaOrTransaction = this.prisma) {
    return db.master_tray_type.findMany({
      where: {
        is_active: true,
      },

      include: {
        master_brand: true,
      },

      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },

        {
          color: 'asc',
        },
      ],
    });
  }

  // Decision 10: inactive tray types with open balances stay visible, so the
  // grid needs every tray type, not only the active ones. The builder marks
  // inactive ones read-only.
  async getAllTrayTypes(db: PrismaOrTransaction = this.prisma) {
    return db.master_tray_type.findMany({
      include: {
        master_brand: true,
      },

      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },

        {
          color: 'asc',
        },
      ],
    });
  }

  async getTrayTransactions(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.client_tray_transaction.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      include: {
        master_client: true,

        master_tray_type: {
          include: {
            master_brand: true,
          },
        },
      },
    });
  }

  async getPreviousSheet(
    groupId: number,
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.findFirst({
      where: {
        group_id: groupId,
        order_paper: {
          sale_date: {
            lt: saleDate,
          },
        },
      },
      orderBy: {
        order_paper: {
          sale_date: 'desc',
        },
      },
    });
  }

  async getPreviousTrayBalances(
    orderSheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.client_tray_transaction.findMany({
      where: {
        order_sheet_id: orderSheetId,
      },
    });
  }

  /**
   * Opening balances for a sheet, keyed by (client, tray type, category).
   *
   * CT-15.7: for each key, the most recent prior balance in the same group
   * wins, even when the immediately previous sheet has no line for it (a
   * gap). Only nonzero closings carry; a key whose latest closing is 0 has
   * nothing outstanding.
   */
  async getOpeningBalances(
    groupId: number,
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ): Promise<Map<string, number>> {
    const balances = new Map<string, number>();

    // Newest sheet first, so `distinct` keeps the latest line for each key.
    const rows = await db.client_tray_transaction.findMany({
      where: {
        order_sheet: {
          group_id: groupId,
          order_paper: { sale_date: { lt: saleDate } },
        },
      },
      orderBy: { order_sheet: { order_paper: { sale_date: 'desc' } } },
      distinct: ['client_id', 'tray_type_id', 'category'],
      select: {
        client_id: true,
        tray_type_id: true,
        category: true,
        closing_balance: true,
      },
    });

    for (const row of rows) {
      const closing = Number(row.closing_balance ?? 0);

      if (closing !== 0) {
        balances.set(
          buildClientTrayKey({
            clientId: row.client_id,
            trayTypeId: row.tray_type_id,
            category: row.category,
          }),
          closing,
        );
      }
    }

    return balances;
  }

  /**
   * Makes the sheet's stored ledger exactly equal to `entries`.
   *
   * Decision 13: rows that are no longer part of the calculated ledger are
   * deleted even when `entries` is empty, and deletion is restricted to this
   * sheet.
   */
  async replaceTrayTransactions(
    sheetId: number,
    entries: TrayTransactionEntry[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (entries.some((e) => e.order_sheet_id !== sheetId)) {
      throw new Error(
        `replaceTrayTransactions received entries that do not belong to sheet ${sheetId}`,
      );
    }

    const existing = await db.client_tray_transaction.findMany({
      where: { order_sheet_id: sheetId },
      select: { id: true, client_id: true, tray_type_id: true, category: true },
    });

    const keyOf = (r: {
      client_id: number;
      tray_type_id: number;
      category: SupplyCategory;
    }) =>
      buildClientTrayKey({
        clientId: r.client_id,
        trayTypeId: r.tray_type_id,
        category: r.category,
      });

    const incomingKeys = new Set(entries.map(keyOf));

    const toDeleteIds = existing
      .filter((r) => !incomingKeys.has(keyOf(r)))
      .map((r) => r.id);

    if (toDeleteIds.length > 0) {
      await db.client_tray_transaction.deleteMany({
        where: { order_sheet_id: sheetId, id: { in: toDeleteIds } },
      });
    }

    if (entries.length === 0) return;

    const values = Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${e.order_sheet_id}, ${e.client_id}, ${e.tray_type_id}, ${e.category}::"SupplyCategory", ${e.opening_balance}, ${e.trays_taken}, ${e.trays_returned}, ${e.closing_balance}, now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO client_tray_transaction
      (order_sheet_id, client_id, tray_type_id, category, opening_balance, trays_taken, trays_returned, closing_balance, updated_at)
    VALUES ${values}
    ON CONFLICT (order_sheet_id, client_id, tray_type_id, category)
    DO UPDATE SET opening_balance = EXCLUDED.opening_balance,
                  trays_taken = EXCLUDED.trays_taken,
                  trays_returned = EXCLUDED.trays_returned,
                  closing_balance = EXCLUDED.closing_balance,
                  updated_at = EXCLUDED.updated_at
  `);
  }

  async getNextSheet(
    groupId: number,
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.findFirst({
      where: {
        group_id: groupId,
        order_paper: {
          sale_date: {
            gt: saleDate,
          },
        },
      },
      orderBy: {
        order_paper: {
          sale_date: 'asc',
        },
      },
      include: {
        order_paper: true,
      },
    });
  }

  async findPapersBySaleDateRange(
    from: Date,
    to: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findMany({
      where: { sale_date: { gte: from, lte: to } },
      select: { id: true, sale_date: true },
      orderBy: { sale_date: 'asc' },
    });
  }

  // Decisions 15 and 16: compare-and-advance the sheet-level token. Unlike
  // touchIfUnchanged, an explicit null token only matches a sheet whose token
  // is still empty, so the check can never be skipped.
  async touchClientTraysIfTokenMatches(
    sheetId: number,
    expectedUpdatedAt: Date | null,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
      db.order_sheet,
      { id: sheetId },
      'client_trays_updated_at',
      expectedUpdatedAt,
    );
  }
}
