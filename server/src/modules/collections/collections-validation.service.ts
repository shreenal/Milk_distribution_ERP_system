import {
    Injectable,
    BadRequestException,
} from '@nestjs/common';

import { PrismaService }
    from '../../prisma/prisma.service.js';

@Injectable()
export class CollectionsValidationService {

    constructor(
        private readonly prisma:
            PrismaService,
    ) {}

    async validateNightCollections(
        sheetId: number,
    ): Promise<void> {

        const collections =
            await this.prisma
                .client_collection
                .findMany({

                    where: {
                        order_sheet_id:
                            sheetId,
                    },
                });

        for (const row of collections) {

            if (
                Number(
                    row.office_amount_given ?? 0,
                ) < 0
            ) {

                throw new BadRequestException(
                    'Office amount given cannot be negative',
                );
            }
        }
    }

    async validateMorningCollections(
        sheetId: number,
    ): Promise<void> {

        const collections =
            await this.prisma
                .client_collection
                .findMany({

                    where: {
                        order_sheet_id:
                            sheetId,
                    },
                });

        for (const row of collections) {

            if (
                Number(
                    row.cash_collection ?? 0,
                ) < 0
            ) {

                throw new BadRequestException(
                    'Cash collection cannot be negative',
                );
            }

            if (
                Number(
                    row.cheque_collection ?? 0,
                ) < 0
            ) {

                throw new BadRequestException(
                    'Cheque collection cannot be negative',
                );
            }
        }
    }

    async validateAdminCollections(
        sheetId: number,
    ): Promise<void> {

        const collections =
            await this.prisma
                .client_collection
                .findMany({

                    where: {
                        order_sheet_id:
                            sheetId,
                    },
                });

        for (const row of collections) {

            if (
                Number(
                    row.online_collection ?? 0,
                ) < 0
            ) {

                throw new BadRequestException(
                    'Online collection cannot be negative',
                );
            }

            if (
                Number(
                    row.bank_deposit ?? 0,
                ) < 0
            ) {

                throw new BadRequestException(
                    'Bank deposit cannot be negative',
                );
            }
        }
    }
}