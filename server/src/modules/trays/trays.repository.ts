import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';

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

    return sheet?.order_paper?.status;
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

  async getPreviousClosingBalance(data: {
    currentSheetId: number;

    groupId: number;

    clientId: number;

    trayTypeId: number;

    paperDate: Date;
  }) {
    const previousSheet = await this.prisma.order_sheet.findFirst({
      where: {
        group_id: data.groupId,

        order_paper: {
          order_date: {
            lt: data.paperDate,
          },
        },
      },

      include: {
        order_paper: true,
      },

      orderBy: {
        order_paper: {
          order_date: 'desc',
        },
      },
    });

    if (!previousSheet) {
      return 0;
    }

    const previousTransaction =
      await this.prisma.client_tray_transaction.findUnique({
        where: {
          order_sheet_id_client_id_tray_type_id: {
            order_sheet_id: previousSheet.id,

            client_id: data.clientId,

            tray_type_id: data.trayTypeId,
          },
        },
      });

    return Number(previousTransaction?.closing_balance ?? 0);
  }

  async upsertTrayTransaction(data: {
    order_sheet_id: number;

    client_id: number;

    tray_type_id: number;

    opening_balance: number;

    trays_taken: number;

    trays_returned: number;

    closing_balance: number;
  }) {
    return this.prisma.client_tray_transaction.upsert({
      where: {
        order_sheet_id_client_id_tray_type_id: {
          order_sheet_id: data.order_sheet_id,

          client_id: data.client_id,

          tray_type_id: data.tray_type_id,
        },
      },

      update: {
        opening_balance: data.opening_balance,

        trays_taken: data.trays_taken,

        trays_returned: data.trays_returned,

        closing_balance: data.closing_balance,
      },

      create: {
        order_sheet_id: data.order_sheet_id,

        client_id: data.client_id,

        tray_type_id: data.tray_type_id,

        opening_balance: data.opening_balance,

        trays_taken: data.trays_taken,

        trays_returned: data.trays_returned,

        closing_balance: data.closing_balance,
      },
    });
  }
}
