import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';

import { NightCollectionEntryDto } from './dto/save-night-collection.dto.js';
import { MorningCollectionEntryDto } from './dto/save-morning-collection.dto.js';
import { AdminCollectionEntryDto } from './dto/save-admin-collection.dto.js';

import { SupplyCategory } from '../../../generated/prisma/client.js';
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
        code: 'asc',
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
    for (const entry of entries) {
      await db.client_collection.upsert({
        where: {
          order_sheet_id_client_id_category: {
            order_sheet_id: sheetId,
            client_id: entry.clientId,
            category,
          },
        },

        create: {
          order_sheet_id: sheetId,
          client_id: entry.clientId,
          category,
          office_amount_given: entry.officeAmountGiven,
        },

        update: {
          office_amount_given: entry.officeAmountGiven,
        },
      });
    }
  }

  async replaceMorningCollections(
    sheetId: number,
    category: SupplyCategory,
    entries: MorningCollectionEntryDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (const entry of entries) {
      await db.client_collection.upsert({
        where: {
          order_sheet_id_client_id_category: {
            order_sheet_id: sheetId,
            client_id: entry.clientId,
            category,
          },
        },

        create: {
          order_sheet_id: sheetId,
          client_id: entry.clientId,
          category,
          cash_collection: entry.cashCollection,
          cheque_collection: entry.chequeCollection,
          employee_remarks: entry.employeeRemarks,
        },

        update: {
          cash_collection: entry.cashCollection,
          cheque_collection: entry.chequeCollection,
          employee_remarks: entry.employeeRemarks,
        },
      });
    }
  }

  async replaceAdminCollections(
    sheetId: number,
    category: SupplyCategory,
    entries: AdminCollectionEntryDto[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (const entry of entries) {
      await db.client_collection.upsert({
        where: {
          order_sheet_id_client_id_category: {
            order_sheet_id: sheetId,
            client_id: entry.clientId,
            category,
          },
        },

        create: {
          order_sheet_id: sheetId,
          client_id: entry.clientId,
          category,
          online_collection: entry.onlineCollection,
          bank_deposit: entry.bankDeposit,
          admin_remarks: entry.adminRemarks,
        },

        update: {
          online_collection: entry.onlineCollection,
          bank_deposit: entry.bankDeposit,
          admin_remarks: entry.adminRemarks,
        },
      });
    }
  }
}
