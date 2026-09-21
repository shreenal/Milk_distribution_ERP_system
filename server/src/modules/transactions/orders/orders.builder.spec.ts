import { describe, expect, it, vi } from 'vitest';

import { OrdersBuilder } from './order.builder.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import {
    BillingRow,
    OrderBillingInput,
} from '../../../types/order.types.js';

describe('OrdersBuilder', () => {
    const productColumnsBuilder = {
        buildGroupedColumns: vi.fn(),
    };

    const workflowState = {
        resolveUseOrderedQuantity: vi.fn(),
    };

    const builder = new OrdersBuilder(
        productColumnsBuilder as any,
        workflowState as any,
    );

    const milkProducts = [
        { id: 1, name: 'Milk' },
        { id: 2, name: 'Curd' },
    ];

    const nonMilkProducts = [
        { id: 3, name: 'Paneer' },
        { id: 4, name: 'Butter' },
    ];

    const milkClients = [
        { id: 101, name: 'Client A' },
        { id: 102, name: 'Client B' },
    ];

    const nonMilkClients = [
        { id: 201, name: 'Client C' },
    ];

    function createInput(sheetItems: any[] = []): OrderBillingInput {
        return {
            milkProducts,
            nonMilkProducts,
            milkClients,
            nonMilkClients,
            sheetItems,
        } as unknown as OrderBillingInput;
    }

    function mockColumns() {
        productColumnsBuilder.buildGroupedColumns
            .mockImplementation((products: any[], isNonMilk: boolean) => ({
                products,
                isNonMilk,
            }));
    }

    describe('product columns', () => {
        it('builds milk and non-milk columns with the correct category flag', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput(),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(
                productColumnsBuilder.buildGroupedColumns,
            ).toHaveBeenCalledTimes(2);

            expect(
                productColumnsBuilder.buildGroupedColumns,
            ).toHaveBeenNthCalledWith(
                1,
                milkProducts,
                false,
            );

            expect(
                productColumnsBuilder.buildGroupedColumns,
            ).toHaveBeenNthCalledWith(
                2,
                nonMilkProducts,
                true,
            );

            expect(result.milkGrid.columns).toEqual({
                products: milkProducts,
                isNonMilk: false,
            });

            expect(result.nonMilkGrid.columns).toEqual({
                products: nonMilkProducts,
                isNonMilk: true,
            });
        });
    });

    describe('ordered quantity mode', () => {
        it('uses ordered_qty and night billing in DRAFT', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 10,
                        delivered_qty: 7,
                        night_bill_amount: 100,
                        final_bill_amount: 70,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(
                workflowState.resolveUseOrderedQuantity,
            ).toHaveBeenCalledWith(
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.rows).toEqual([
                {
                    clientId: 101,
                    clientName: 'Client A',
                    billAmount: 100,
                    product_1: 10,
                },
                {
                    clientId: 102,
                    clientName: 'Client B',
                    billAmount: 0,
                },
            ]);

            expect(result.milkGrid.totals).toEqual({
                totalClients: 2,
                totalBillAmount: 100,
            });
        });

        it('uses ordered_qty and night billing when morning entry is not saved', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 12,
                        delivered_qty: 4,
                        night_bill_amount: 120,
                        final_bill_amount: 40,
                    },
                ]),
                OrderPaperStatus.NIGHT_SUBMITTED,
                false,
            );

            expect(result.milkGrid.rows[0]).toEqual({
                clientId: 101,
                clientName: 'Client A',
                billAmount: 120,
                product_1: 12,
            });

            expect(result.milkGrid.totals.totalBillAmount).toBe(120);
        });
    });

    describe('delivered quantity mode', () => {
        it('uses delivered_qty and final billing when morning entry is saved', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(false);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 12,
                        delivered_qty: 4,
                        night_bill_amount: 120,
                        final_bill_amount: 40,
                    },
                ]),
                OrderPaperStatus.NIGHT_SUBMITTED,
                true,
            );

            expect(
                workflowState.resolveUseOrderedQuantity,
            ).toHaveBeenCalledWith(
                OrderPaperStatus.NIGHT_SUBMITTED,
                true,
            );

            expect(result.milkGrid.rows[0]).toEqual({
                clientId: 101,
                clientName: 'Client A',
                billAmount: 40,
                product_1: 4,
            });

            expect(result.milkGrid.totals).toEqual({
                totalClients: 2,
                totalBillAmount: 40,
            });
        });

        it('uses delivered_qty and final billing for REOPENED', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(false);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 20,
                        delivered_qty: 6,
                        night_bill_amount: 200,
                        final_bill_amount: 60,
                    },
                ]),
                OrderPaperStatus.REOPENED,
                false,
            );

            expect(result.milkGrid.rows[0]).toEqual({
                clientId: 101,
                clientName: 'Client A',
                billAmount: 60,
                product_1: 6,
            });

            expect(result.milkGrid.totals.totalBillAmount).toBe(60);
        });
    });

    describe('category separation', () => {
        it('puts milk and non-milk products into their respective client rows', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 10,
                        delivered_qty: 8,
                        night_bill_amount: 100,
                        final_bill_amount: 80,
                    },
                    {
                        client_id: 101,
                        product_id: 3,
                        ordered_qty: 5,
                        delivered_qty: 4,
                        night_bill_amount: 50,
                        final_bill_amount: 40,
                    },
                    {
                        client_id: 201,
                        product_id: 3,
                        ordered_qty: 7,
                        delivered_qty: 6,
                        night_bill_amount: 70,
                        final_bill_amount: 60,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.rows).toEqual([
                {
                    clientId: 101,
                    clientName: 'Client A',
                    billAmount: 100,
                    product_1: 10,
                },
                {
                    clientId: 102,
                    clientName: 'Client B',
                    billAmount: 0,
                },
            ]);

            expect(result.nonMilkGrid.rows).toEqual([
                {
                    clientId: 201,
                    clientName: 'Client C',
                    billAmount: 70,
                    product_3: 7,
                },
            ]);
        });

        it('does not include products from another category in the current grid', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 10,
                        delivered_qty: 8,
                        night_bill_amount: 100,
                        final_bill_amount: 80,
                    },
                    {
                        client_id: 101,
                        product_id: 3,
                        ordered_qty: 5,
                        delivered_qty: 4,
                        night_bill_amount: 50,
                        final_bill_amount: 40,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.rows[0]).toEqual({
                clientId: 101,
                clientName: 'Client A',
                billAmount: 100,
                product_1: 10,
            });

            expect(result.nonMilkGrid.rows[0]).toEqual({
                clientId: 201,
                clientName: 'Client C',
                billAmount: 0,
            });
        });
    });

    describe('multiple products and totals', () => {
        it('aggregates multiple products for the same client', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 10,
                        delivered_qty: 8,
                        night_bill_amount: 100,
                        final_bill_amount: 80,
                    },
                    {
                        client_id: 101,
                        product_id: 2,
                        ordered_qty: 5,
                        delivered_qty: 4,
                        night_bill_amount: 55,
                        final_bill_amount: 44,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.rows[0]).toEqual({
                clientId: 101,
                clientName: 'Client A',
                billAmount: 155,
                product_1: 10,
                product_2: 5,
            });

            expect(result.milkGrid.totals).toEqual({
                totalClients: 2,
                totalBillAmount: 155,
            });
        });

        it('aggregates milk and non-milk totals independently', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 10,
                        delivered_qty: 8,
                        night_bill_amount: 100,
                        final_bill_amount: 80,
                    },
                    {
                        client_id: 201,
                        product_id: 3,
                        ordered_qty: 5,
                        delivered_qty: 4,
                        night_bill_amount: 50,
                        final_bill_amount: 40,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.totals).toEqual({
                totalClients: 2,
                totalBillAmount: 100,
            });

            expect(result.nonMilkGrid.totals).toEqual({
                totalClients: 1,
                totalBillAmount: 50,
            });
        });
    });

    describe('zero and rounding behavior', () => {
        it('uses zero when quantities and bill amounts are null', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: null,
                        delivered_qty: null,
                        night_bill_amount: null,
                        final_bill_amount: null,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.rows[0]).toEqual({
                clientId: 101,
                clientName: 'Client A',
                billAmount: 0,
                product_1: 0,
            });

            expect(result.milkGrid.totals.totalBillAmount).toBe(0);
        });

        it('rounds client and category bill totals to two decimals', () => {
            mockColumns();

            workflowState.resolveUseOrderedQuantity.mockReturnValue(true);

            const result = builder.buildOrderBillingSection(
                createInput([
                    {
                        client_id: 101,
                        product_id: 1,
                        ordered_qty: 1,
                        delivered_qty: 1,
                        night_bill_amount: 10.126,
                        final_bill_amount: 9.999,
                    },
                    {
                        client_id: 102,
                        product_id: 1,
                        ordered_qty: 1,
                        delivered_qty: 1,
                        night_bill_amount: 20.125,
                        final_bill_amount: 20,
                    },
                ]),
                OrderPaperStatus.DRAFT,
                false,
            );

            expect(result.milkGrid.rows[0].billAmount).toBe(10.13);
            expect(result.milkGrid.rows[1].billAmount).toBe(20.13);

            expect(result.milkGrid.totals.totalBillAmount).toBe(30.25);
        });
    });
});
