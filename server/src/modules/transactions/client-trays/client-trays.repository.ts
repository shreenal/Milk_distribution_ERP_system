import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  PrismaOrTransaction,
  TrayTransactionEntry,
} from '../../../types/transaction.types.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class ClientTraysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getPaperStatusBySheetId(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const sheet = await db.order_sheet.findUnique({
      where: {
        id: sheetId,
      },

      select: {
        master_group: {
          select: {
            delivery_session: true,
          },
        },

        order_paper: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!sheet?.order_paper?.status) {
      throw new NotFoundException('Paper status not found');
    }

    return sheet.order_paper.status;
  }

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

  async replaceTrayTransactions(
    entries: TrayTransactionEntry[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (entries.length === 0) return;

    const values = Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${e.order_sheet_id}, ${e.client_id}, ${e.tray_type_id}, ${e.opening_balance}, ${e.trays_taken}, ${e.trays_returned}, ${e.closing_balance}, now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO client_tray_transaction
      (order_sheet_id, client_id, tray_type_id, opening_balance, trays_taken, trays_returned, closing_balance, updated_at)
    VALUES ${values}
    ON CONFLICT (order_sheet_id, client_id, tray_type_id)
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
    });
  }

  async markClientTrayMorningEntrySaved(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.update({
      where: {
        id: sheetId,
      },
      data: {
        client_tray_morning_saved_at: new Date(),
      },
    });
  }
}
