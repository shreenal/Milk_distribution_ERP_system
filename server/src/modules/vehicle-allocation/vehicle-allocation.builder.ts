import { Injectable } from '@nestjs/common';

import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';

@Injectable()
export class VehicleAllocationBuilder {

    constructor(

        private readonly productColumnsBuilder:
            ProductColumnsBuilder,
    ) { }

    buildGroupSummary(

        sheets: any[],

        sheetItems: any[],

        products: any[],
    ) {

        const summariesMap =
            new Map();

        for (
            const product of products
        ) {

            const key =
                `${product.master_brand.id}_${product.master_product_group.id}`;

            if (
                !summariesMap.has(
                    key,
                )
            ) {

                summariesMap.set(
                    key,
                    {

                        summaryKey:
                            key,

                        brandId:
                            product.master_brand.id,

                        brandName:
                            product.master_brand.name,

                        productGroupId:
                            product.master_product_group.id,

                        productGroupName:
                            product.master_product_group.name,

                        products: [],

                        rows: [],
                    },
                );
            }

            summariesMap
                .get(key)
                .products
                .push(
                    product,
                );
        }

        for (
            const sheet of sheets
        ) {

            const summaryRowsMap =
                new Map();

            for (
                const [key]
                of summariesMap
            ) {

                summaryRowsMap.set(
                    key,
                    {

                        groupId:
                            sheet.group_id,

                        groupName:
                            sheet.master_group.name,
                    },
                );
            }

            const currentSheetItems =
                sheetItems.filter(

                    item =>
                        item.order_sheet_id ===
                        sheet.id,
                );

            for (
                const item of currentSheetItems
            ) {

                const key =
                    `${item.master_product.master_brand.id}_${item.master_product.master_product_group.id}`;

                const row =
                    summaryRowsMap.get(
                        key,
                    );

                const field =
                    `product_${item.product_id}`;

                row[field] =
                    (
                        row[field]
                        ?? 0
                    )
                    +
                    Number(
                        item.ordered_qty
                        ?? 0,
                    );
            }

            for (
                const [key, row]
                of summaryRowsMap
            ) {

                summariesMap
                    .get(key)
                    .rows
                    .push(
                        row,
                    );
            }
        }

        const summaries: any[] = [];

        for (
            const summary
            of summariesMap.values()
        ) {

            summary.columns =
                this
                    .buildVehicleCapacityColumns(

                        summary.products,

                        summary
                            .productGroupName
                        !== 'Milk',
                    );

            delete summary.products;

            summaries.push(
                summary,
            );
        }

        return {

            summaries,
        };
    }




    private buildVehicleCapacityColumns(
        products: any[],
        includePackagingType: boolean
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


    buildVehicleAllocationGrids(
        summaries: any[],
        vehicles: any[],
    ) {

        const allocations: any[] = [];

        for (
            const summary of summaries
        ) {

            const rows: any[] = [];

            const productFields =
                initializeProductFields(
                    summary.columns,
                );

            for (
                const vehicle of vehicles
            ) {

                rows.push({

                    vehicleId:
                        vehicle.id,

                    vehicleName:
                        vehicle.vehicle_name,

                    ...structuredClone(
                        productFields,
                    ),
                });
            }

            const summaryTotal: any = {};

            for (
                const row of summary.rows
            ) {

                for (
                    const [key, value]
                    of Object.entries(
                        row,
                    )
                ) {

                    if (
                        key === 'groupId' ||
                        key === 'groupName'
                    ) {

                        continue;
                    }

                    summaryTotal[key] =
                        (
                            summaryTotal[key]
                            ?? 0
                        )
                        +
                        Number(
                            value ?? 0,
                        );
                }
            }

            allocations.push({

                summaryKey:
                    summary.summaryKey,

                brandId:
                    summary.brandId,

                brandName:
                    summary.brandName,

                productGroupId:
                    summary.productGroupId,

                productGroupName:
                    summary.productGroupName,

                summaryTotal,

                columns:
                    summary.columns,

                rows,
            });
        }



        return {

            allocations,
        };
    }

    applyVehicleAllocations(
        allocationGrids: any,
        savedAllocations: any[],
    ) {

        const result =
            structuredClone(
                allocationGrids,
            );

        for (
            const allocation of savedAllocations
        ) {

            const field =
                `product_${allocation.product_id}`;

            for (
                const grid of result.allocations
            ) {

                const row =
                    grid.rows.find(
                        vehicle =>
                            vehicle.vehicleId ===
                            allocation.vehicle_id,
                    );

                if (
                    row &&
                    field in row
                ) {

                    row[field] =
                        Number(
                            allocation.allocated_qty,
                        );

                    break;
                }
            }
        }

        return result;
    }
}

const initializeProductFields = (
    columns: any[],
) => {

    const row: any = {};

    const walk = (
        nodes: any[],
    ) => {

        for (
            const node of nodes
        ) {

            if (
                node.field
            ) {

                row[node.field] = 0;
            }

            if (
                node.children
            ) {

                walk(
                    node.children,
                );
            }
        }
    };

    walk(
        columns,
    );

    return row;
};

