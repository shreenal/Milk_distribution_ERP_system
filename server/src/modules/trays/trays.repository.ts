import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { TrayTransactionEntry } from '../../types/transaction.types.js';

@Injectable()
export class TraysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getPaperStatusBySheetId(sheetId: number) {
    const sheet = await this.prisma.order_sheet.findUnique({
      where: {
        id: sheetId,
      },

      select: {
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

  async findSheetById(sheetId: number) {
    return this.prisma.order_sheet.findUnique({
      where: {
        id: sheetId,
      },

      include: {
        master_group: true,

        order_paper: true,
      },
    });
  }

  async getClientsByGroupId(groupId: number) {
    return this.prisma.master_client.findMany({
      where: {
        delivery_group_id: groupId,

        is_active: true,
      },

      orderBy: {
        name: 'asc',
      },
    });
  }

  async getSheetItems(sheetId: number) {
    return this.prisma.order_sheet_items.findMany({
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

  async getProductTrayRules() {
    return this.prisma.product_tray_rule.findMany({
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

  async getTrayTypes() {
    return this.prisma.master_tray_type.findMany({
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

  async getTrayTransactions(sheetId: number) {
    return this.prisma.client_tray_transaction.findMany({
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

  async getPreviousSheet(groupId: number, saleDate: Date) {
  return this.prisma.order_sheet.findFirst({
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

  async getPreviousTrayBalances(orderSheetId: number) {
    return this.prisma.client_tray_transaction.findMany({
      where: {
        order_sheet_id: orderSheetId,
      },
    });
  }

  async replaceTrayTransactions(entries: TrayTransactionEntry[]) {
    await this.prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        await tx.client_tray_transaction.upsert({
          where: {
            order_sheet_id_client_id_tray_type_id: {
              order_sheet_id: entry.order_sheet_id,
              client_id: entry.client_id,
              tray_type_id: entry.tray_type_id,
            },
          },

          update: {
            opening_balance: entry.opening_balance,
            trays_taken: entry.trays_taken,
            trays_returned: entry.trays_returned,
            closing_balance: entry.closing_balance,
          },

          create: {
            order_sheet_id: entry.order_sheet_id,
            client_id: entry.client_id,
            tray_type_id: entry.tray_type_id,
            opening_balance: entry.opening_balance,
            trays_taken: entry.trays_taken,
            trays_returned: entry.trays_returned,
            closing_balance: entry.closing_balance,
          },
        });
      }
    });
  }
}
