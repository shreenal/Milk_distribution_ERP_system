import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';

import type { Prisma }
    from '../../generated/prisma/client.js';

import { OrdersRepository }
    from './orders.repository.js';

@Injectable()
export class OrdersBillingBuilder {

    private readonly logger =
        new Logger(
            OrdersBillingBuilder.name,
        );

    constructor(

        private readonly ordersRepository:
            OrdersRepository,
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
        this.buildGroupedColumns(
            milkProducts,
            'night',
        );

    const nonMilkColumns =
        this.buildGroupedColumns(
            nonMilkProducts,
            'night',
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

    let totalNightBillAmount = 0;

    let totalFinalBillAmount = 0;

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

        let nightBillAmount = 0;

        let finalBillAmount = 0;

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
            }

            nightBillAmount +=
                Number(
                    item.night_bill_amount ?? 0,
                );

            finalBillAmount +=
                Number(
                    item.final_bill_amount ?? 0,
                );
        }

        milkRow.nightBillAmount =
            Number(
                nightBillAmount.toFixed(2),
            );

        milkRow.finalBillAmount =
            Number(
                finalBillAmount.toFixed(2),
            );

        nonMilkRow.nightBillAmount =
            Number(
                nightBillAmount.toFixed(2),
            );

        nonMilkRow.finalBillAmount =
            Number(
                finalBillAmount.toFixed(2),
            );

        milkRows.push(
            milkRow,
        );

        nonMilkRows.push(
            nonMilkRow,
        );

        totalNightBillAmount +=
            nightBillAmount;

        totalFinalBillAmount +=
            finalBillAmount;
    }

    return {

        milkGrid: {

            columns:
                milkColumns,

            rows:
                milkRows,
        },

        nonMilkGrid: {

            columns:
                nonMilkColumns,

            rows:
                nonMilkRows,
        },

        totals: {

            totalClients:
                clients.length,

            totalNightBillAmount:
                Number(
                    totalNightBillAmount
                        .toFixed(2),
                ),

            totalFinalBillAmount:
                Number(
                    totalFinalBillAmount
                        .toFixed(2),
                ),
        },
    };
}

    private buildGroupedColumns(
        products: any[],
        mode: 'night' | 'morning',
    ) {

        const brandMap = new Map();

        for (const product of products) {

            const brandName =
                product.master_brand?.name ?? 'Unknown Brand';

            const productGroupName =
                product.master_product_group?.name ?? 'Unknown Group';

            const productTypeName =
                product.master_product_type?.name ?? 'Unknown Type';

            const packagingTypeName =
                product.master_packaging_type?.name ?? 'Unknown Packaging';

            const sizeLabel =
                `${product.packaging_size}${product.packaging_unit}`;

            // =========================
            // BRAND
            // =========================

            if (!brandMap.has(brandName)) {

                brandMap.set(
                    brandName,
                    {
                        headerName: brandName,
                        children: [],
                    },
                );
            }

            const brandGroup =
                brandMap.get(brandName);

            // =========================
            // PRODUCT GROUP
            // =========================

            let productGroupNode =
                brandGroup.children.find(
                    child =>
                        child.headerName === productGroupName,
                );

            if (!productGroupNode) {

                productGroupNode = {
                    headerName: productGroupName,
                    children: [],
                };

                brandGroup.children.push(
                    productGroupNode,
                );
            }

            // =========================
            // PRODUCT TYPE
            // =========================

            let productTypeNode =
                productGroupNode.children.find(
                    child =>
                        child.headerName === productTypeName,
                );

            if (!productTypeNode) {

                productTypeNode = {
                    headerName: productTypeName,
                    children: [],
                };

                productGroupNode.children.push(
                    productTypeNode,
                );
            }

            // =========================
            // PACKAGING TYPE
            // =========================

            let packagingTypeNode =
                productTypeNode.children.find(
                    child =>
                        child.headerName === packagingTypeName,
                );

            if (!packagingTypeNode) {

                packagingTypeNode = {
                    headerName: packagingTypeName,
                    children: [],
                };

                productTypeNode.children.push(
                    packagingTypeNode,
                );
            }

            // =========================
            // FINAL COLUMN
            // =========================

            packagingTypeNode.children.push({

                headerName: sizeLabel,

                field:
                    mode === 'night'
                        ? `product_${product.id}_ordered`
                        : `product_${product.id}_delivered`,

                productId:
                    product.id,

                editable: true,
            });
        }

        return Array.from(
            brandMap.values(),
        );
    }
}