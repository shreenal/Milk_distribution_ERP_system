import { Injectable } from '@nestjs/common';

import { PrismaService }
    from '../../prisma/prisma.service.js';

@Injectable()
export class PaperRepository {

    constructor(
        private readonly prisma:
            PrismaService,
    ) {}


    async findTodayPaper(
        today: Date,
        tomorrow: Date,
    ) {

        return this.prisma.order_paper.findFirst({

            where: {
                sale_date: {
                    gte: today,
                    lt: tomorrow,
                },
            },

            include: {
                order_sheet: true,
            },
        });
    }

    async findLatestPaper() {

        return this.prisma.order_paper.findFirst({

            orderBy: {
                order_date: 'desc',
            },

            include: {
                order_sheet: true,
            },
        });
    }

    
    async findPaperById(
        paperId: number,
    ) {

        return this.prisma
            .order_paper
            .findUnique({

                where: {
                    id: paperId,
                },
            });
    }

        async findOrderPaper(today: Date, tomorrow: Date) {
        return this.prisma.order_paper.findFirst({
            where: {
                order_date: {
                    gte: today,
                    lt: tomorrow,
                },
            },
        });
    }

    async getSheetItems(
        sheetId: number,
    ) {

        return this.prisma
            .order_sheet_items
            .findMany({

                where: {
                    order_sheet_id: sheetId,
                },

                include: {

                    master_client: true,

                    master_product: {
                        include: {
                            master_brand: true,
                            master_product_group: true,
                            master_packaging_type: true,
                            master_product_type: true,
                        }
                    },
                }
            });
    }

    async getPaperSheets(
        paperId: number,
    ) {

        return this.prisma
            .order_sheet
            .findMany({

                where: {

                    order_paper_id:
                        paperId,
                },

                include: {

                    master_group: {

                        select: {

                            id: true,

                            name: true,
                        },
                    },
                },

                orderBy: {

                    id: 'asc',
                },
            });
    }

    async getActiveGroups() {

        return this.prisma.master_group.findMany({

            where: {
                is_active: true,
            },
        });
    }

    async generateOrderPaper(
        date: Date,
    ) {

        const saleDate =
            new Date(date);

        saleDate.setDate(
            saleDate.getDate() + 1,
        );

        return this.prisma
            .order_paper
            .create({

                data: {

                    order_date:
                        date,

                    sale_date:
                        saleDate,

                    status:
                        'DRAFT',
                },
            });
    }

    async generateOrderSheets(
        paperId: number,
        groups: { id: number }[]
    ) {

        return this.prisma.order_sheet.createMany({

            data: groups.map(group => ({

                order_paper_id: paperId,

                group_id: group.id,
            })),
            skipDuplicates: true
        });
    }


     async submitNightEntry(
        paperId: number,
    ) {

        return this.prisma
            .order_paper
            .update({

                where: {
                    id: paperId,
                },

                data: {

                    status:
                        'NIGHT_SUBMITTED',

                    night_entry_submitted_at:
                        new Date(),
                },
            });
    }


    async submitMorningEntry(
        paperId: number,
    ) {

        return this.prisma
            .order_paper
            .update({

                where: {
                    id: paperId,
                },

                data: {

                    status:
                        'MORNING_SUBMITTED',

                    morning_entry_submitted_at:
                        new Date(),
                },
            });
    }


    async finalizePaper(
        paperId: number,
    ) {

        return this.prisma
            .order_paper
            .update({

                where: {
                    id: paperId,
                },

                data: {

                    status:
                        'FINALIZED',

                    finalized_at:
                        new Date(),
                },
            });
    }

    async reopenPaper(
        paperId: number,
        reason: string,
    ) {

        return this.prisma
            .order_paper
            .update({

                where: {
                    id: paperId,
                },

                data: {

                    status:
                        'REOPENED',

                    reopened_at:
                        new Date(),

                    reopen_reason:
                        reason,
                },
            });
    }
}