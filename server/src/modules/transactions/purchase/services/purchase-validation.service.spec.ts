import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';

import { PurchaseValidationService } from './purchase-validation.service.js';
import { PurchaseRepository } from '../purchase.repository.js';
import { DeliverySession, SupplyCategory } from '../../../../generated/prisma/client.js';
import { PURCHASE_ERROR_MESSAGES } from '../purchase.constants.js';

describe('PurchaseValidationService', () => {
    let service: PurchaseValidationService;
    let purchaseRepository: Mocked<PurchaseRepository>;
    let tx: Record<string, unknown>;

    const paperId = 1;

    const product = {
        id: 30,
    };

    const vehicleAssignment = {
        vehicle_id: 10,
        distributor_id: 20,
        category: 'MILK',
        vehicle_allocation_paper: {
            delivery_session: DeliverySession.MORNING,
        },
    } as any;

    const allocation = {
        id: 100,
        vehicle_id: 10,
        distributor_id: 20,
        category: 'MILK',
        product_id: 30,
        allocated_qty: 10,
        vehicle_allocation_paper: {
            delivery_session: DeliverySession.MORNING,
        },
    } as any;

    const purchaseEntry = {
        vehicleId: 10,
        distributorId: 20,
        category: SupplyCategory.MILK,
        productId: 30,
        deliverySession: DeliverySession.MORNING,
        purchasedQty: 5,
    };

    beforeEach(() => {
        purchaseRepository = {
            findProducts: vi.fn(),
            findVehicleAssignmentsByPaperId: vi.fn(),
            findVehicleAllocationsByPaperId: vi.fn(),
            findPurchasePaper: vi.fn(),
            findPurchaseEntries: vi.fn(),
        } as any;

        tx = {};

        service = new PurchaseValidationService(
            purchaseRepository,
        );
    });

    describe('validatePurchases', () => {
        beforeEach(() => {
            purchaseRepository.findProducts.mockResolvedValue([
                product,
            ] as any);

            purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue(
                [vehicleAssignment],
            );

            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [allocation],
            );
        });

        it('loads products, vehicle assignments and allocations using the provided db client', async () => {
            await service.validatePurchases(
                paperId,
                {
                    entries: [purchaseEntry],
                } as any,
                tx as any,
            );

            expect(
                purchaseRepository.findProducts,
            ).toHaveBeenCalledWith(tx);

            expect(
                purchaseRepository.findVehicleAssignmentsByPaperId,
            ).toHaveBeenCalledWith(paperId, tx);

            expect(
                purchaseRepository.findVehicleAllocationsByPaperId,
            ).toHaveBeenCalledWith(paperId, tx);
        });

        it('passes valid purchase entries', async () => {
            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [purchaseEntry],
                    } as any,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });

        it('rejects when there are no vehicle allocations', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [],
            );

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [purchaseEntry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('rejects negative purchased quantity', async () => {
            const entry = {
                ...purchaseEntry,
                purchasedQty: -1,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.NEGATIVE_PURCHASE_QTY,
            );
        });

        it('allows zero purchased quantity', async () => {
            const entry = {
                ...purchaseEntry,
                purchasedQty: 0,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });

        it('does not validate product, vehicle or allocation matching for zero quantity entries', async () => {
            const entry = {
                ...purchaseEntry,
                productId: 999,
                vehicleId: 999,
                purchasedQty: 0,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });

        it('rejects an invalid product', async () => {
            const entry = {
                ...purchaseEntry,
                productId: 999,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.INVALID_PRODUCT(999),
            );
        });

        it('rejects an invalid vehicle', async () => {
            const entry = {
                ...purchaseEntry,
                vehicleId: 999,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.INVALID_VEHICLE(999),
            );
        });

        it('rejects when the vehicle assignment does not exist', async () => {
           purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue([
  {
    vehicle_id: 10,
    distributor_id: 20,
    category: SupplyCategory.MILK,
    vehicle_allocation_paper: {
      delivery_session: DeliverySession.NIGHT,
    },
  },
] as any);

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [purchaseEntry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(10),
            );
        });

        it('rejects when the assignment distributor does not match the entry distributor', async () => {
            const entry = {
                ...purchaseEntry,
                distributorId: 999,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(10),
            );
        });

        it('rejects when the allocation does not exist', async () => {
            const entry = {
                ...purchaseEntry,
                productId: 999,
            };

            purchaseRepository.findProducts.mockResolvedValue([
                {
                    id: 999,
                },
            ] as any);

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.ALLOCATION_NOT_FOUND(10, 999),
            );
        });

        it('rejects when purchased quantity exceeds allocated quantity', async () => {
            const entry = {
                ...purchaseEntry,
                purchasedQty: 11,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.PURCHASE_EXCEEDS_ALLOCATION,
            );
        });

        it('allows purchased quantity equal to allocated quantity', async () => {
            const entry = {
                ...purchaseEntry,
                purchasedQty: 10,
            };

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [entry],
                    } as any,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });

        it('rejects allocations with a null vehicle id', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    {
                        ...allocation,
                        vehicle_id: null,
                    },
                ] as any,
            );

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [purchaseEntry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
            );
        });

        it('rejects allocations with a null product id', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    {
                        ...allocation,
                        product_id: null,
                    },
                ] as any,
            );

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [purchaseEntry],
                    } as any,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
            );
        });

        it('validates multiple entries independently', async () => {
            const secondEntry = {
                ...purchaseEntry,
                productId: 31,
            };

            purchaseRepository.findProducts.mockResolvedValue([
                product,
                { id: 31 },
            ] as any);

            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    allocation,
                    {
                        ...allocation,
                        id: 101,
                        product_id: 31,
                    },
                ] as any,
            );

            await expect(
                service.validatePurchases(
                    paperId,
                    {
                        entries: [
                            purchaseEntry,
                            secondEntry,
                        ],
                    } as any,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });
    });

    describe('validatePurchasesComplete', () => {
        beforeEach(() => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [allocation],
            );

            purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue(
                [vehicleAssignment],
            );

            purchaseRepository.findPurchasePaper.mockResolvedValue({
                id: 200,
            } as any);

            purchaseRepository.findPurchaseEntries.mockResolvedValue([
                {
                    distributor_id: 20,
                    category: 'MILK',
                    vehicle_id: 10,
                    product_id: 30,
                    delivery_session: DeliverySession.MORNING,
                },
            ] as any);
        });

        it('loads allocations using the provided db client', async () => {
            await service.validatePurchasesComplete(
                paperId,
                tx as any,
            );

            expect(
                purchaseRepository.findVehicleAllocationsByPaperId,
            ).toHaveBeenCalledWith(paperId, tx);
        });

        it('throws when there are no vehicle allocations', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [],
            );

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ALLOCATIONS,
            );
        });

        it('passes when every positive allocation has a matching purchase entry', async () => {
            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });

        it('throws when a required allocation has no purchase entry', async () => {
            purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.PURCHASE_MISSING(10, 30),
            );
        });

        it('accepts a missing purchase paper when all allocations have zero quantity', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    {
                        ...allocation,
                        allocated_qty: 0,
                    },
                ] as any,
            );

            purchaseRepository.findPurchasePaper.mockResolvedValue(null);

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).resolves.toBeUndefined();

            expect(
                purchaseRepository.findPurchaseEntries,
            ).not.toHaveBeenCalled();
        });

        it('rejects a missing purchase paper when a positive allocation is required', async () => {
            purchaseRepository.findPurchasePaper.mockResolvedValue(null);

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.PURCHASES_NOT_COMPLETED,
            );

            expect(
                purchaseRepository.findPurchaseEntries,
            ).not.toHaveBeenCalled();
        });

        it('ignores zero-quantity allocations when checking completeness', async () => {
            const zeroAllocation = {
                ...allocation,
                id: 101,
                product_id: 31,
                allocated_qty: 0,
            };

            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    allocation,
                    zeroAllocation,
                ] as any,
            );

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).resolves.toBeUndefined();
        });

        it('rejects required allocations with null vehicle id', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    {
                        ...allocation,
                        vehicle_id: null,
                    },
                ] as any,
            );

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
            );
        });

        it('rejects required allocations with null product id', async () => {
            purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue(
                [
                    {
                        ...allocation,
                        product_id: null,
                    },
                ] as any,
            );

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
            );
        });

        it('rejects when the allocation assignment is missing', async () => {
            purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue(
                [],
            );

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(10),
            );
        });

        it('rejects when the allocation assignment distributor does not match', async () => {
            purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue(
                [
                    {
                        ...vehicleAssignment,
                        distributor_id: 999,
                    },
                ],
            );

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(10),
            );
        });

        it('uses the distributor/category/vehicle/product/session combination when matching purchase entries', async () => {
            purchaseRepository.findPurchaseEntries.mockResolvedValue([
                {
                    distributor_id: 999,
                    category: SupplyCategory.MILK,
                    vehicle_id: 10,
                    product_id: 30,
                    delivery_session: DeliverySession.MORNING,
                },
            ] as any);

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.PURCHASE_MISSING(10, 30),
            );
        });

        it('requires the correct delivery session when matching purchase entries', async () => {
            purchaseRepository.findPurchaseEntries.mockResolvedValue([
                {
                    distributor_id: 20,
                    category: SupplyCategory.MILK,
                    vehicle_id: 10,
                    product_id: 30,
                    delivery_session: DeliverySession.NIGHT,
                },
            ] as any);

            await expect(
                service.validatePurchasesComplete(
                    paperId,
                    tx as any,
                ),
            ).rejects.toThrow(
                PURCHASE_ERROR_MESSAGES.PURCHASE_MISSING(10, 30),
            );
        });
    });

    describe('validateNoDuplicateEntries', () => {
        it('passes when all entries have unique combinations', () => {
            expect(() =>
                service.validateNoDuplicateEntries([
                    purchaseEntry,
                    {
                        ...purchaseEntry,
                        productId: 31,
                    },
                ]),
            ).not.toThrow();
        });

        it('rejects duplicate vehicle-distributor-category-product-session combinations', () => {
            expect(() =>
                service.validateNoDuplicateEntries([
                    purchaseEntry,
                    purchaseEntry,
                ]),
            ).toThrow(BadRequestException);
        });

        it('includes the duplicate key in the error', () => {
            expect(() =>
                service.validateNoDuplicateEntries([
                    purchaseEntry,
                    purchaseEntry,
                ]),
            ).toThrow(
                `Duplicate purchase entries found: 10_20_MILK_30_${DeliverySession.MORNING}`,
            );
        });

        it('allows the same vehicle and product when the distributor differs', () => {
            expect(() =>
                service.validateNoDuplicateEntries([
                    purchaseEntry,
                    {
                        ...purchaseEntry,
                        distributorId: 21,
                    },
                ]),
            ).not.toThrow();
        });

        it('allows the same vehicle and product when the category differs', () => {
            expect(() =>
                service.validateNoDuplicateEntries([
                    purchaseEntry,
                    {
                        ...purchaseEntry,
                        category: SupplyCategory.NON_MILK,
                    },
                ]),
            ).not.toThrow();
        });

        it('allows the same vehicle and product when the delivery session differs', () => {
            expect(() =>
                service.validateNoDuplicateEntries([
                    purchaseEntry,
                    {
                        ...purchaseEntry,
                        deliverySession: DeliverySession.NIGHT,
                    },
                ]),
            ).not.toThrow();
        });

        it('allows an empty entry list', () => {
            expect(() =>
                service.validateNoDuplicateEntries([]),
            ).not.toThrow();
        });
    });
});