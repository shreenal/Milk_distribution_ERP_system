import { Injectable } from '@nestjs/common';

import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';

@Injectable()
export class VehicleCapacityBuilder {

    constructor(

        private readonly productColumnsBuilder:
            ProductColumnsBuilder,
    ) { }

    buildGroupSummary(

        sheets: any[],

        sheetItems: any[],

        milkProducts: any[],

        nonMilkProducts: any[],
    ) {


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

        for (const sheet of sheets) {

            const milkRow: any = {

                groupId:
                    sheet.group_id,

                groupName:
                    sheet.master_group.name,
            };

            const nonMilkRow: any = {

                groupId:
                    sheet.group_id,

                groupName:
                    sheet.master_group.name,
            };

            const currentSheetItems =
                sheetItems.filter(

                    item =>
                        item.order_sheet_id ===
                        sheet.id,
                );

            for (
                const item of currentSheetItems
            ) {

                const field =
                    `product_${item.product_id}`;

                if (
                    milkProductIds.has(
                        item.product_id,
                    )
                ) {

                    milkRow[field] =
                        (
                            milkRow[field] ?? 0
                        ) +
                        Number(
                            item.ordered_qty ?? 0,
                        );
                }

                if (
                    nonMilkProductIds.has(
                        item.product_id,
                    )
                ) {

                    nonMilkRow[field] =
                        (
                            nonMilkRow[field] ?? 0
                        ) +
                        Number(
                            item.ordered_qty ?? 0,
                        );
                }
            }

            milkRows.push(
                milkRow,
            );

            nonMilkRows.push(
                nonMilkRow,
            );
        }

        const milkColumns =
            this.buildVehicleCapacityColumns(
                milkProducts,
                false,
            );

        const nonMilkColumns =
            this.buildVehicleCapacityColumns(
                nonMilkProducts,
                true,
            );

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
        };
    }

    private buildVehicleCapacityColumns(
        products: any[],
        includePackagingType:boolean
    ) {
        const columns =
            this.productColumnsBuilder
                .buildGroupedColumns(
                    products,
                    'night',
                    includePackagingType
                );

        const updateFields = (
            nodes: any[],
        ) => {

            for (
                const node of nodes
            ) {

                if (
                    node.field &&
                    node.productId
                ) {

                    node.field =
                        `product_${node.productId}`;
                }

                if (
                    node.children
                ) {

                    updateFields(
                        node.children,
                    );
                }
            }
        };

        updateFields(
            columns,
        );

        return columns;
    }
}