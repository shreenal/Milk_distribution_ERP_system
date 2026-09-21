import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DeliverySession,
    SupplyCategory,
} from '../../../generated/prisma/client.js';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { PurchaseBuilder } from './purchase.builder.js';

describe('PurchaseBuilder', () => {
    let builder: PurchaseBuilder;
    let productColumnsBuilder: {
        buildGroupedColumns: ReturnType<typeof vi.fn>;
    };
    let purchaseVarianceCalculator: {
        calculate: ReturnType<typeof vi.fn>;
    };
    let purchaseBillingService: {
        calculate: ReturnType<typeof vi.fn>;
    };

    const category = SupplyCategory.MILK;
    const otherCategory = SupplyCategory.NON_MILK;

    const baseColumns = [
        {
            headerName: 'Milk',
            field: 'product_30',
            productId: 30,
            children: [],
        },
    ];

    const baseGrid = {
        purchases: [
            {
                distributor: {
                    id: 20,
                    name: 'Distributor 20',
                },
                category,
                brand: {
                    id: 40,
                    name: 'Brand 40',
                },
                columns: [
                    {
                        headerName: 'Product 30',
                        children: [
                            {
                                headerName: 'Quantity',
                                field: 'product_30',
                                productId: 30,
                                editable: true,
                                children: [],
                            },
                            {
                                headerName: 'Rate',
                                field: 'product_30_rate',
                                productId: 30,
                                children: [],
                            },
                            {
                                headerName: 'Amount',
                                field: 'product_30_amount',
                                productId: 30,
                                children: [],
                            },
                        ],
                    },
                ],
                rows: [
                    {
                        vehicleId: 10,
                        deliverySession: DeliverySession.MORNING,
                        vehicleName: 'Vehicle 10',
                        product_30: 0,
                        product_30_rate: 0,
                        product_30_amount: 0,
                    },
                ],
            },
        ],
    };

    const allocation = {
        id: 501,
        vehicle_id: 10,
        distributor_id: 20,
        category,
        product_id: 30,
        allocated_qty: 15,
        vehicle_allocation_paper: {
            delivery_session: DeliverySession.MORNING,
        },
    };

    const purchaseEntry = {
        vehicle_id: 10,
        distributor_id: 20,
        category,
        product_id: 30,
        delivery_session: DeliverySession.MORNING,
        purchased_qty: 12,
        purchase_rate: 25,
        purchase_amount: 300,
        source_allocation_id: 501,
        source_allocated_qty: 15,
    };

    beforeEach(() => {
        productColumnsBuilder = {
            buildGroupedColumns: vi.fn(),
        };

        purchaseVarianceCalculator = {
            calculate: vi.fn(),
        };

        purchaseBillingService = {
            calculate: vi.fn(),
        };

        builder = new PurchaseBuilder(
            productColumnsBuilder as unknown as ProductColumnsBuilder,
            purchaseVarianceCalculator as unknown as PurchaseVarianceCalculator,
            purchaseBillingService as unknown as PurchaseBillingService,
        );
    });

    describe('buildPurchaseGrids', () => {
        it('builds a purchase grid for a summary with assigned vehicles', () => {
            productColumnsBuilder.buildGroupedColumns.mockReturnValue(baseColumns);

            const summaries = [
                {
                    distributorId: 20,
                    category,
                    brandId: 40,
                    brandName: 'Brand 40',
                    products: [{ id: 30 }],
                },
            ];

            const assignments = [
                {
                    vehicle_id: 10,
                    distributor_id: 20,
                    category,
                    master_distributor: {
                        name: 'Distributor 20',
                    },
                    master_vehicle: {
                        vehicle_name: 'Vehicle 10',
                    },
                    vehicle_allocation_paper: {
                        delivery_session: DeliverySession.MORNING,
                    },
                },
            ];

            const result = builder.buildPurchaseGrids(
                summaries as any,
                assignments as any,
            );

            expect(
                productColumnsBuilder.buildGroupedColumns,
            ).toHaveBeenCalledWith(
                summaries[0].products,
                false,
            );

            expect(result.purchases).toHaveLength(1);
            expect(result.purchases[0]).toMatchObject({
                distributor: {
                    id: 20,
                    name: 'Distributor 20',
                },
                category,
                brand: {
                    id: 40,
                    name: 'Brand 40',
                },
            });

            expect(result.purchases[0].rows).toEqual([
                {
                    vehicleId: 10,
                    deliverySession: DeliverySession.MORNING,
                    vehicleName: 'Vehicle 10',
                    product_30: 0,
                    product_30_rate: 0,
                    product_30_amount: 0,
                },
            ]);
        });

        it('includes packaging type for NON_MILK products', () => {
            productColumnsBuilder.buildGroupedColumns.mockReturnValue(baseColumns);

            const summaries = [
                {
                    distributorId: 20,
                    category: otherCategory,
                    brandId: 40,
                    brandName: 'Brand 40',
                    products: [{ id: 30 }],
                },
            ];

            const assignments = [
                {
                    vehicle_id: 10,
                    distributor_id: 20,
                    category: otherCategory,
                    master_distributor: {
                        name: 'Distributor 20',
                    },
                    master_vehicle: {
                        vehicle_name: 'Vehicle 10',
                    },
                    vehicle_allocation_paper: {
                        delivery_session: DeliverySession.MORNING,
                    },
                },
            ];

            builder.buildPurchaseGrids(
                summaries as any,
                assignments as any,
            );

            expect(
                productColumnsBuilder.buildGroupedColumns,
            ).toHaveBeenCalledWith(
                summaries[0].products,
                true,
            );
        });

        it('skips summaries with no products', () => {
            const summaries = [
                {
                    distributorId: 20,
                    category,
                    brandId: 40,
                    brandName: 'Brand 40',
                    products: [],
                },
            ];

            const result = builder.buildPurchaseGrids(
                summaries as any,
                [],
            );

            expect(result).toEqual({
                purchases: [],
            });

            expect(
                productColumnsBuilder.buildGroupedColumns,
            ).not.toHaveBeenCalled();
        });

        it('skips summaries with no assigned vehicles', () => {
            productColumnsBuilder.buildGroupedColumns.mockReturnValue(baseColumns);

            const summaries = [
                {
                    distributorId: 20,
                    category,
                    brandId: 40,
                    brandName: 'Brand 40',
                    products: [{ id: 30 }],
                },
            ];

            const assignments = [
                {
                    vehicle_id: 10,
                    distributor_id: 99,
                    category,
                    master_distributor: {
                        name: 'Other Distributor',
                    },
                    master_vehicle: {
                        vehicle_name: 'Vehicle 10',
                    },
                    vehicle_allocation_paper: {
                        delivery_session: DeliverySession.MORNING,
                    },
                },
            ];

            const result = builder.buildPurchaseGrids(
                summaries as any,
                assignments as any,
            );

            expect(result.purchases).toEqual([]);
        });

        it('creates independent row product fields for each assigned vehicle', () => {
            productColumnsBuilder.buildGroupedColumns.mockReturnValue(baseColumns);

            const summaries = [
                {
                    distributorId: 20,
                    category,
                    brandId: 40,
                    brandName: 'Brand 40',
                    products: [{ id: 30 }],
                },
            ];

            const assignments = [
                {
                    vehicle_id: 10,
                    distributor_id: 20,
                    category,
                    master_distributor: { name: 'Distributor 20' },
                    master_vehicle: { vehicle_name: 'Vehicle 10' },
                    vehicle_allocation_paper: {
                        delivery_session: DeliverySession.MORNING,
                    },
                },
                {
                    vehicle_id: 11,
                    distributor_id: 20,
                    category,
                    master_distributor: { name: 'Distributor 20' },
                    master_vehicle: { vehicle_name: 'Vehicle 11' },
                    vehicle_allocation_paper: {
                        delivery_session: DeliverySession.NIGHT,
                    },
                },
            ];

            const result = builder.buildPurchaseGrids(
                summaries as any,
                assignments as any,
            );

            result.purchases[0].rows[0].product_30 = 99;

            expect(result.purchases[0].rows[1].product_30).toBe(0);
        });

        it('transforms product column fields into quantity, rate and amount children', () => {
            productColumnsBuilder.buildGroupedColumns.mockReturnValue([
                {
                    headerName: 'Product',
                    field: 'product_30',
                    productId: 30,
                    children: [],
                },
            ]);

            const result = builder.buildPurchaseGrids(
                [
                    {
                        distributorId: 20,
                        category,
                        brandId: 40,
                        brandName: 'Brand 40',
                        products: [{ id: 30 }],
                    },
                ] as any,
                [
                    {
                        vehicle_id: 10,
                        distributor_id: 20,
                        category,
                        master_distributor: { name: 'Distributor 20' },
                        master_vehicle: { vehicle_name: 'Vehicle 10' },
                        vehicle_allocation_paper: {
                            delivery_session: DeliverySession.MORNING,
                        },
                    },
                ] as any,
            );

            expect(result.purchases[0].columns).toEqual([
                {
                    headerName: 'Product',
                    productId: 30,
                    children: [
                        {
                            headerName: 'Quantity',
                            field: 'product_30',
                            productId: 30,
                            editable: true,
                            children: [],
                        },
                        {
                            headerName: 'Rate',
                            field: 'product_30_rate',
                            productId: 30,
                            children: [],
                        },
                        {
                            headerName: 'Amount',
                            field: 'product_30_amount',
                            productId: 30,
                            children: [],
                        },
                    ],
                },
            ]);
        });
    });

    describe('applyVehicleAllocations', () => {
        it('applies allocation quantities to matching rows', () => {
            const result = builder.applyVehicleAllocations(
                baseGrid as any,
                [allocation] as any,
            );

            expect(result.purchases[0].rows[0].product_30).toBe(15);
        });

        it('converts allocation quantity to a number', () => {
            const stringAllocation = {
                ...allocation,
                allocated_qty: '15.5',
            };

            const result = builder.applyVehicleAllocations(
                baseGrid as any,
                [stringAllocation] as any,
            );

            expect(result.purchases[0].rows[0].product_30).toBe(15.5);
        });

        it('skips allocations with null vehicle ids', () => {
            const result = builder.applyVehicleAllocations(
                baseGrid as any,
                [
                    {
                        ...allocation,
                        vehicle_id: null,
                    },
                ] as any,
            );

            expect(result.purchases[0].rows[0].product_30).toBe(0);
        });

        it('skips allocations with null product ids', () => {
            const result = builder.applyVehicleAllocations(
                baseGrid as any,
                [
                    {
                        ...allocation,
                        product_id: null,
                    },
                ] as any,
            );

            expect(result.purchases[0].rows[0].product_30).toBe(0);
        });

        it('does not modify the original grid', () => {
            const original = structuredClone(baseGrid);

            builder.applyVehicleAllocations(
                baseGrid as any,
                [allocation] as any,
            );

            expect(baseGrid).toEqual(original);
        });

        it('ignores allocations without a matching row', () => {
            const result = builder.applyVehicleAllocations(
                baseGrid as any,
                [
                    {
                        ...allocation,
                        vehicle_id: 999,
                    },
                ] as any,
            );

            expect(result.purchases[0].rows[0].product_30).toBe(0);
        });
    });

    describe('applyPurchaseEntries', () => {
        it('applies purchase quantity, rate and amount to a matching row', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [purchaseEntry] as any,
                [allocation] as any,
            );

            const row = result.purchases[0].rows[0];

            expect(row.product_30).toBe(12);
            expect(row.product_30_rate).toBe(25);
            expect(row.product_30_amount).toBe(300);
            expect(row.product_30_stale).toBe(false);
        });

        it('marks an entry stale when its source allocation is missing', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [purchaseEntry] as any,
                [],
            );

            expect(result.purchases[0].rows[0].product_30_stale).toBe(true);
        });

        it('marks an entry stale when its source allocation id differs', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [
                    {
                        ...purchaseEntry,
                        source_allocation_id: 999,
                    },
                ] as any,
                [allocation] as any,
            );

            expect(result.purchases[0].rows[0].product_30_stale).toBe(true);
        });

        it('marks an entry stale when its source allocated quantity differs', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [
                    {
                        ...purchaseEntry,
                        source_allocated_qty: 20,
                    },
                ] as any,
                [allocation] as any,
            );

            expect(result.purchases[0].rows[0].product_30_stale).toBe(true);
        });

        it('marks an entry stale when source allocation id is null', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [
                    {
                        ...purchaseEntry,
                        source_allocation_id: null,
                    },
                ] as any,
                [allocation] as any,
            );

            expect(result.purchases[0].rows[0].product_30_stale).toBe(true);
        });

        it('marks an entry stale when source allocated quantity is null', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [
                    {
                        ...purchaseEntry,
                        source_allocated_qty: null,
                    },
                ] as any,
                [allocation] as any,
            );

            expect(result.purchases[0].rows[0].product_30_stale).toBe(true);
        });

        it('converts persisted numeric values to numbers', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [
                    {
                        ...purchaseEntry,
                        purchased_qty: '12.5',
                        purchase_rate: '25.25',
                        purchase_amount: '315.625',
                        source_allocated_qty: '15',
                    },
                ] as any,
                [
                    {
                        ...allocation,
                        allocated_qty: '15',
                    },
                ] as any,
            );

            const row = result.purchases[0].rows[0];

            expect(row.product_30).toBe(12.5);
            expect(row.product_30_rate).toBe(25.25);
            expect(row.product_30_amount).toBe(315.625);
            expect(row.product_30_stale).toBe(false);
        });

        it('surfaces entries that no longer have a matching grid row as orphans', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [
                    {
                        ...purchaseEntry,
                        vehicle_id: 999,
                    },
                ] as any,
                [allocation] as any,
            );

            expect(result.orphanedEntries).toEqual([
                {
                    vehicleId: 999,
                    distributorId: 20,
                    category,
                    productId: 30,
                    deliverySession: DeliverySession.MORNING,
                    purchasedQty: 12,
                },
            ]);
        });

        it('initializes orphanedEntries even when there are no purchase entries', () => {
            const result = builder.applyPurchaseEntries(
                baseGrid as any,
                [],
                [allocation] as any,
            );

            expect(result.orphanedEntries).toEqual([]);
        });

        it('does not modify the original grid', () => {
            const original = structuredClone(baseGrid);

            builder.applyPurchaseEntries(
                baseGrid as any,
                [purchaseEntry] as any,
                [allocation] as any,
            );

            expect(baseGrid).toEqual(original);
        });
    });

    describe('applyPurchaseRates', () => {
        it('applies a rate to the matching row', () => {
            purchaseBillingService.calculate.mockReturnValue({
                purchaseAmount: 250,
            });

            const result = builder.applyPurchaseRates(
                baseGrid as any,
                [
                    {
                        distributorId: 20,
                        category,
                        vehicleId: 10,
                        productId: 30,
                        deliverySession: DeliverySession.MORNING,
                        purchaseRate: 25,
                        unitMultiplier: 1,
                    },
                ] as any,
            );

            const row = result.purchases[0].rows[0];

            expect(row.product_30_rate).toBe(25);
            expect(row.product_30_amount).toBe(250);

            expect(purchaseBillingService.calculate).toHaveBeenCalledWith(
                0,
                25,
                1,
            );
        });

        it('uses the existing quantity when calculating the amount', () => {
            purchaseBillingService.calculate.mockReturnValue({
                purchaseAmount: 500,
            });

            const grid = structuredClone(baseGrid);
            grid.purchases[0].rows[0].product_30 = 10;

            const result = builder.applyPurchaseRates(
                grid as any,
                [
                    {
                        distributorId: 20,
                        category,
                        vehicleId: 10,
                        productId: 30,
                        deliverySession: DeliverySession.MORNING,
                        purchaseRate: 25,
                        unitMultiplier: 2,
                    },
                ] as any,
            );

            expect(
                purchaseBillingService.calculate,
            ).toHaveBeenCalledWith(10, 25, 2);

            expect(result.purchases[0].rows[0].product_30_amount).toBe(500);
        });

        it('converts the rate to a number', () => {
            purchaseBillingService.calculate.mockReturnValue({
                purchaseAmount: 250,
            });

            const result = builder.applyPurchaseRates(
                baseGrid as any,
                [
                    {
                        distributorId: 20,
                        category,
                        vehicleId: 10,
                        productId: 30,
                        deliverySession: DeliverySession.MORNING,
                        purchaseRate: '25.5',
                        unitMultiplier: 1,
                    },
                ] as any,
            );

            expect(result.purchases[0].rows[0].product_30_rate).toBe(25.5);
        });

        it('ignores rates without a matching row', () => {
            const result = builder.applyPurchaseRates(
                baseGrid as any,
                [
                    {
                        distributorId: 20,
                        category,
                        vehicleId: 999,
                        productId: 30,
                        deliverySession: DeliverySession.MORNING,
                        purchaseRate: 25,
                        unitMultiplier: 1,
                    },
                ] as any,
            );

            expect(
                purchaseBillingService.calculate,
            ).not.toHaveBeenCalled();

            expect(result.purchases[0].rows[0].product_30_rate).toBe(0);
        });

        it('does not modify the original grid', () => {
            const original = structuredClone(baseGrid);

            purchaseBillingService.calculate.mockReturnValue({
                purchaseAmount: 250,
            });

            builder.applyPurchaseRates(
                baseGrid as any,
                [
                    {
                        distributorId: 20,
                        category,
                        vehicleId: 10,
                        productId: 30,
                        deliverySession: DeliverySession.MORNING,
                        purchaseRate: 25,
                        unitMultiplier: 1,
                    },
                ] as any,
            );

            expect(baseGrid).toEqual(original);
        });
    });

    describe('applyVarianceMetadata', () => {
        it('calculates and applies variance metadata to a matching row', () => {
            purchaseVarianceCalculator.calculate.mockReturnValue({
                hasVariance: true,
                variance: -3,
                variancePercentage: -20,
                severity: 'LOW',
            });

            const result = builder.applyVarianceMetadata(
                baseGrid as any,
                [allocation] as any,
                [purchaseEntry] as any,
            );

            expect(
                purchaseVarianceCalculator.calculate,
            ).toHaveBeenCalledWith(15, 12);

            expect(
                result.purchases[0].rows[0].product_30_variance,
            ).toEqual({
                allocatedQty: 15,
                purchasedQty: 12,
                hasVariance: true,
                variance: -3,
                variancePercentage: -20,
                severity: 'LOW',
            });
        });

        it('converts allocation and purchase quantities to numbers', () => {
            purchaseVarianceCalculator.calculate.mockReturnValue({
                hasVariance: false,
                variance: 0,
                variancePercentage: 0,
                severity: 'NONE',
            });

            builder.applyVarianceMetadata(
                baseGrid as any,
                [
                    {
                        ...allocation,
                        allocated_qty: '15',
                    },
                ] as any,
                [
                    {
                        ...purchaseEntry,
                        purchased_qty: '15',
                    },
                ] as any,
            );

            expect(
                purchaseVarianceCalculator.calculate,
            ).toHaveBeenCalledWith(15, 15);
        });

        it('skips purchase entries without a matching allocation', () => {
            const result = builder.applyVarianceMetadata(
                baseGrid as any,
                [],
                [purchaseEntry] as any,
            );

            expect(
                purchaseVarianceCalculator.calculate,
            ).not.toHaveBeenCalled();

            expect(
                result.purchases[0].rows[0].product_30_variance,
            ).toBeUndefined();
        });

        it('skips entries whose matching allocation has no grid row', () => {
            purchaseVarianceCalculator.calculate.mockReturnValue({
                hasVariance: true,
                variance: 1,
                variancePercentage: 10,
                severity: 'LOW',
            });

            const result = builder.applyVarianceMetadata(
                baseGrid as any,
                [allocation] as any,
                [
                    {
                        ...purchaseEntry,
                        vehicle_id: 999,
                    },
                ] as any,
            );

            expect(
                purchaseVarianceCalculator.calculate,
            ).not.toHaveBeenCalled();

            expect(
                result.purchases[0].rows[0].product_30_variance,
            ).toBeUndefined();
        });

        it('does not modify the original grid', () => {
            const original = structuredClone(baseGrid);

            purchaseVarianceCalculator.calculate.mockReturnValue({
                hasVariance: true,
                variance: -3,
                variancePercentage: -20,
                severity: 'LOW',
            });

            builder.applyVarianceMetadata(
                baseGrid as any,
                [allocation] as any,
                [purchaseEntry] as any,
            );

            expect(baseGrid).toEqual(original);
        });
    });
});