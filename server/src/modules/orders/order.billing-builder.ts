import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';

import type { Prisma }
    from '../../generated/prisma/client.js';

import { OrdersRepository }
    from './orders.repository.js';
import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';

@Injectable()
export class OrdersBillingBuilder {

    private readonly logger =
        new Logger(
            OrdersBillingBuilder.name,
        );

    constructor(

        private readonly ordersRepository:
            OrdersRepository,

        private readonly productColumnsBuilder:
            ProductColumnsBuilder,
    ) { }

    async buildOrderBillingSection(
        sheet: Prisma.order_sheetGetPayload<{
            include: {
                master_group: true;
                order_paper: true;
            };
        }>,
    ) {

        const milkProducts =
            await this.ordersRepository
                .getProductsByGroup(
                    'Milk',
                );

        const nonMilkProducts =
            await this.ordersRepository
                .getProductsByGroup(
                    'Non-Milk',
                );

        const milkColumns =
            this.productColumnsBuilder
                .buildGroupedColumns(
                    milkProducts,
                    'night',
                    false,
                );

        const nonMilkColumns =
            this.productColumnsBuilder
                .buildGroupedColumns(
                    nonMilkProducts,
                    'night',
                    true,
                );

        const clients =
            await this.ordersRepository
                .getClientsByGroupId(
                    sheet.group_id,
                );

        const savedItems =
            await this.ordersRepository
                .getSheetItems(
                    sheet.id,
                );

        const milkProductIds =
            new Set(
                milkProducts.map(
                    p => p.id,
                ),
            );

        const nonMilkProductIds =
            new Set(
                nonMilkProducts.map(
                    p => p.id,
                ),
            );

        const milkRows: any[] = [];

        const nonMilkRows: any[] = [];

        let milkTotalNightBillAmount = 0;

        let milkTotalFinalBillAmount = 0;

        let nonMilkTotalNightBillAmount = 0;

        let nonMilkTotalFinalBillAmount = 0;

        for (const client of clients) {

            const milkRow: any = {

                clientId:
                    client.id,

                clientName:
                    client.name,
            };

            const nonMilkRow: any = {

                clientId:
                    client.id,

                clientName:
                    client.name,
            };

            const clientItems =
                savedItems.filter(
                    item =>
                        item.client_id ===
                        client.id,
                );
            let milkNightBillAmount = 0;

            let milkFinalBillAmount = 0;

            let nonMilkNightBillAmount = 0;

            let nonMilkFinalBillAmount = 0;

            for (const item of clientItems) {

                const orderedQty =
                    Number(
                        item.ordered_qty ?? 0,
                    );

                const deliveredQty =
                    item.delivered_qty !== null
                        ? Number(
                            item.delivered_qty,
                        )
                        : null;

                if (
                    milkProductIds.has(
                        item.product_id,
                    )
                ) {

                    milkRow[
                        `product_${item.product_id}_ordered`
                    ] = orderedQty;

                    milkRow[
                        `product_${item.product_id}_delivered`
                    ] = deliveredQty;

                    milkNightBillAmount +=
                        Number(
                            item.night_bill_amount ?? 0,
                        );

                    milkFinalBillAmount +=
                        Number(
                            item.final_bill_amount ?? 0,
                        );
                }

                if (
                    nonMilkProductIds.has(
                        item.product_id,
                    )
                ) {

                    nonMilkRow[
                        `product_${item.product_id}_ordered`
                    ] = orderedQty;

                    nonMilkRow[
                        `product_${item.product_id}_delivered`
                    ] = deliveredQty;

                    nonMilkNightBillAmount +=
                        Number(
                            item.night_bill_amount ?? 0,
                        );

                    nonMilkFinalBillAmount +=
                        Number(
                            item.final_bill_amount ?? 0,
                        );
                }

            }

            milkRow.nightBillAmount =
                Number(
                    milkNightBillAmount.toFixed(2),
                );

            milkRow.finalBillAmount =
                Number(
                    milkFinalBillAmount.toFixed(2),
                );

            nonMilkRow.nightBillAmount =
                Number(
                    nonMilkNightBillAmount.toFixed(2),
                );

            nonMilkRow.finalBillAmount =
                Number(
                    nonMilkFinalBillAmount.toFixed(2),
                );
            milkRows.push(
                milkRow,
            );

            nonMilkRows.push(
                nonMilkRow,
            );
            milkTotalNightBillAmount +=
                milkNightBillAmount;

            milkTotalFinalBillAmount +=
                milkFinalBillAmount;

            nonMilkTotalNightBillAmount +=
                nonMilkNightBillAmount;

            nonMilkTotalFinalBillAmount +=
                nonMilkFinalBillAmount;
        }

        return {

            milkGrid: {

                columns:
                    milkColumns,

                rows:
                    milkRows,

                totals: {

                    totalClients:
                        clients.length,

                    totalNightBillAmount:
                        Number(
                            milkTotalNightBillAmount
                                .toFixed(2),
                        ),

                    totalFinalBillAmount:
                        Number(
                            milkTotalFinalBillAmount
                                .toFixed(2),
                        ),
                },
            },

            nonMilkGrid: {

                columns:
                    nonMilkColumns,

                rows:
                    nonMilkRows,

                totals: {

                    totalClients:
                        clients.length,

                    totalNightBillAmount:
                        Number(
                            nonMilkTotalNightBillAmount
                                .toFixed(2),
                        ),

                    totalFinalBillAmount:
                        Number(
                            nonMilkTotalFinalBillAmount
                                .toFixed(2),
                        ),
                },
            },
        };
    }
}