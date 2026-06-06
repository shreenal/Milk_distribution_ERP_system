import { Injectable } from '@nestjs/common';

import { PrismaService }
    from '../../prisma/prisma.service.js';

import { NightCollectionEntryDto }
from './dto/save-night-collection.dto.js';

import { MorningCollectionEntryDto }
from './dto/save-morning-collection.dto.js';

import { AdminCollectionEntryDto }
from './dto/save-admin-collection.dto.js';

@Injectable()
export class CollectionsRepository {

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    async getOrderSheetById(
        sheetId: number,
    ) {

        return this.prisma
            .order_sheet
            .findUnique({

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
    ) {

        return this.prisma
            .master_client
            .findMany({

                where: {

                    delivery_group_id:
                        groupId,

                    is_active: true,
                },

                orderBy: {

                    code: 'asc',
                },
            });
    }

    async getCollectionEntries(
        sheetId: number,
    ) {

        return this.prisma
            .client_collection
            .findMany({

                where: {

                    order_sheet_id:
                        sheetId,
                },
            });
    }

async upsertNightCollectionEntry(
    sheetId: number,
    entry: NightCollectionEntryDto,
) {

    return this.prisma
        .client_collection
        .upsert({

            where: {
                order_sheet_id_client_id: {
                    order_sheet_id: sheetId,
                    client_id: entry.clientId,
                },
            },

            create: {
                order_sheet_id: sheetId,
                client_id: entry.clientId,

                office_amount_given:
                    entry.officeAmountGiven,
            },

            update: {
                office_amount_given:
                    entry.officeAmountGiven,
            },
        });
}


async upsertMorningCollectionEntry(
    sheetId: number,
    entry: MorningCollectionEntryDto,
) {

    return this.prisma
        .client_collection
        .upsert({

            where: {
                order_sheet_id_client_id: {
                    order_sheet_id: sheetId,
                    client_id: entry.clientId,
                },
            },

            create: {
                order_sheet_id: sheetId,
                client_id: entry.clientId,

                cash_collection:
                    entry.cashCollection,

                cheque_collection:
                    entry.chequeCollection,

                employee_remarks:
                    entry.employeeRemarks,
            },

            update: {
                cash_collection:
                    entry.cashCollection,

                cheque_collection:
                    entry.chequeCollection,

                employee_remarks:
                    entry.employeeRemarks,
            },
        });
}

async upsertAdminCollectionEntry(
    sheetId: number,
    entry: AdminCollectionEntryDto,
) {

    return this.prisma
        .client_collection
        .upsert({

            where: {
                order_sheet_id_client_id: {
                    order_sheet_id: sheetId,
                    client_id: entry.clientId,
                },
            },

            create: {
                order_sheet_id: sheetId,
                client_id: entry.clientId,

                online_collection:
                    entry.onlineCollection,

                bank_deposit:
                    entry.bankDeposit,

                admin_remarks:
                    entry.adminRemarks,
            },

            update: {
                online_collection:
                    entry.onlineCollection,

                bank_deposit:
                    entry.bankDeposit,

                admin_remarks:
                    entry.adminRemarks,
            },
        });
}

}