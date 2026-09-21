import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { VehicleAllocationValidationService } from './vehicle-allocation-validation.service.js';
import { SupplyCategory, DeliverySession } from '../../../../generated/prisma/client.js';
import { VEHICLE_ALLOCATION_ERROR_MESSAGES } from '../vehicle-allocation.constants.js';

describe('VehicleAllocationValidationService', () => {
    let service: VehicleAllocationValidationService;

    const vehicleAllocationRepository = {
        findOrderPaperById: vi.fn(),
        findVehicles: vi.fn(),
        findDistributors: vi.fn(),
        findProducts: vi.fn(),
        findDistributorProcurementRules: vi.fn(),
        findVehicleAllocationPaper: vi.fn(),
        findVehicleAllocations: vi.fn(),
        findVehicleAssignments: vi.fn(),
        getProductLink: vi.fn(),
    };

    const vehicleAllocationBuilder = {
        buildVehicleAllocationGrids: vi.fn(),
        applyVehicleAllocations: vi.fn(),
    };

    const allocationSummaryBuilder = {
        build: vi.fn(),
    };

    const orderItemsRepository = {
        getOrderItemsWithSupplyContextByPaperId: vi.fn(),
    };

    const workflowState = {
        getActiveExecutionSession: vi.fn(),
    };

    const db = {} as any;

    beforeEach(() => {
        vi.clearAllMocks();

        service = new VehicleAllocationValidationService(
            vehicleAllocationRepository as any,
            vehicleAllocationBuilder as any,
            allocationSummaryBuilder as any,
            orderItemsRepository as any,
            workflowState as any,
        );
    });

    describe('validateVehicleAllocations', () => {
        const paper = {
            id: 1,
            status: 'SOME_STATUS',
        };

        const summaries = [
            {
                distributorId: 10,
                category: SupplyCategory.MILK,
                products: [
                    {
                        id: 100,
                    },
                ],
            },
        ];

        beforeEach(() => {
            vehicleAllocationRepository.findOrderPaperById.mockResolvedValue(paper);

            workflowState.getActiveExecutionSession.mockReturnValue(
                DeliverySession.MORNING,
            );

            orderItemsRepository.getOrderItemsWithSupplyContextByPaperId.mockResolvedValue(
                [],
            );

            allocationSummaryBuilder.build.mockReturnValue(summaries);
        });

        it('should reject when the order paper does not exist', async () => {
            vehicleAllocationRepository.findOrderPaperById.mockResolvedValue(null);

            const dto = {
                allocations: [],
                assignments: [],
            } as any;

            await expect(
                service.validateVehicleAllocations(1, dto, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
            );
        });

        it('should build summaries using the active execution session', async () => {
            const dto = {
                allocations: [],
                assignments: [],
            } as any;

            await service.validateVehicleAllocations(1, dto, db);

            expect(
                workflowState.getActiveExecutionSession,
            ).toHaveBeenCalledWith(paper.status);

            expect(
                orderItemsRepository.getOrderItemsWithSupplyContextByPaperId,
            ).toHaveBeenCalledWith(1, db);

            expect(allocationSummaryBuilder.build).toHaveBeenCalledWith(
                [],
                DeliverySession.MORNING,
            );
        });

        it('should allow an allocation matching the current order demand', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 25,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAllocations(1, dto as any, db),
            ).resolves.toBeUndefined();
        });

        it('should ignore zero-quantity allocations', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 999,
                        category: SupplyCategory.MILK,
                        productId: 999,
                        allocatedQty: 0,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAllocations(1, dto as any, db),
            ).resolves.toBeUndefined();
        });

        it('should ignore negative-quantity allocations', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 999,
                        category: SupplyCategory.MILK,
                        productId: 999,
                        allocatedQty: -5,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAllocations(1, dto as any, db),
            ).resolves.toBeUndefined();
        });

        it('should reject a positive allocation that is not required by the order', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 999,
                        category: SupplyCategory.MILK,
                        productId: 999,
                        allocatedQty: 25,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAllocations(1, dto as any, db),
            ).rejects.toThrow(
                'Product 999 is not required from distributor 999 for category MILK in this order',
            );
        });

        it('should distinguish distributor, category and product when validating the demand key', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.NON_MILK,
                        productId: 100,
                        allocatedQty: 25,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAllocations(1, dto as any, db),
            ).rejects.toThrow();
        });
    });

    describe('validateVehicleAllocationsForNightSubmit', () => {
        it('should resolve when allocated quantities exactly match required quantities', async () => {
            const allocationGrid = {
                allocations: [
                    {
                        brand: {
                            name: 'Brand A',
                        },
                        totals: {
                            product_100: 50,
                        },
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 20,
                            },
                            {
                                vehicleId: 2,
                                product_100: 30,
                            },
                        ],
                    },
                ],
            };

            mockAllocationGrid(allocationGrid);

            await expect(
                service.validateVehicleAllocationsForNightSubmit(1, db),
            ).resolves.toBeUndefined();
        });

        it('should reject when allocated quantity is less than required', async () => {
            const allocationGrid = {
                allocations: [
                    {
                        brand: {
                            name: 'Brand A',
                        },
                        totals: {
                            product_100: 50,
                        },
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 20,
                            },
                        ],
                    },
                ],
            };

            mockAllocationGrid(allocationGrid);

            await expect(
                service.validateVehicleAllocationsForNightSubmit(1, db),
            ).rejects.toThrow(
                'Brand A product_100 allocation mismatch. Required: 50, Allocated: 20',
            );
        });

        it('should reject when allocated quantity exceeds required quantity', async () => {
            const allocationGrid = {
                allocations: [
                    {
                        brand: {
                            name: 'Brand A',
                        },
                        totals: {
                            product_100: 50,
                        },
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 60,
                            },
                        ],
                    },
                ],
            };

            mockAllocationGrid(allocationGrid);

            await expect(
                service.validateVehicleAllocationsForNightSubmit(1, db),
            ).rejects.toThrow(
                'Brand A product_100 allocation mismatch. Required: 50, Allocated: 60',
            );
        });

        it('should treat a missing row quantity as zero', async () => {
            const allocationGrid = {
                allocations: [
                    {
                        brand: {
                            name: 'Brand A',
                        },
                        totals: {
                            product_100: 50,
                        },
                        rows: [
                            {
                                vehicleId: 1,
                            },
                            {
                                vehicleId: 2,
                                product_100: 50,
                            },
                        ],
                    },
                ],
            };

            mockAllocationGrid(allocationGrid);

            await expect(
                service.validateVehicleAllocationsForNightSubmit(1, db),
            ).resolves.toBeUndefined();
        });
    });

    describe('validateVehicleAssignments', () => {
        const vehicles = [{ id: 1 }, { id: 2 }];

        const distributors = [{ id: 10 }, { id: 20 }];

        const products = [
            {
                id: 100,
                brand_id: 1,
                product_group_id: 5,
                master_product_group: {
                    category: SupplyCategory.MILK,
                },
            },
            {
                id: 200,
                brand_id: 2,
                product_group_id: 6,
                master_product_group: {
                    category: SupplyCategory.NON_MILK,
                },
            },
        ];

        const procurementRules = [
            {
                distributor_id: 10,
                category: SupplyCategory.MILK,
                brand_id: 1,
                product_group_id: 5,
            },
            {
                distributor_id: 20,
                category: SupplyCategory.NON_MILK,
                brand_id: 2,
                product_group_id: 6,
            },
        ];

        beforeEach(() => {
            vehicleAllocationRepository.findVehicles.mockResolvedValue(vehicles);
            vehicleAllocationRepository.findDistributors.mockResolvedValue(
                distributors,
            );
            vehicleAllocationRepository.findProducts.mockResolvedValue(products);
            vehicleAllocationRepository.findDistributorProcurementRules.mockResolvedValue(
                procurementRules,
            );
        });

        it('should resolve for valid vehicle assignments and allocations', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 25,
                    },
                    {
                        vehicleId: 2,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 10,
                    },
                    {
                        vehicleId: 2,
                        nonMilkDistributorId: 20,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).resolves.toBeUndefined();
        });

        it('should ignore zero-quantity allocations', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 999,
                        distributorId: 999,
                        category: SupplyCategory.MILK,
                        productId: 999,
                        allocatedQty: 0,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).resolves.toBeUndefined();
        });

        it('should reject an allocation for a product that does not exist', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 999,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 10,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow('Product 999 not found');
        });

        it('should reject a vehicle with allocations but no assignment row', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                'Vehicle 1 has allocations but no distributor assignment row',
            );
        });

        it('should reject an unknown vehicle', async () => {
            const dto = {
                allocations: [],
                assignments: [
                    {
                        vehicleId: 999,
                        milkDistributorId: 10,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toMatchObject({
                response: {
                    message: VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_NOT_FOUND(999),
                },
            });
        });

        it('should reject duplicate vehicle assignments', async () => {
            const dto = {
                allocations: [],
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 10,
                    },
                    {
                        vehicleId: 1,
                        nonMilkDistributorId: 20,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toMatchObject({
                response: {
                    message:
                        VEHICLE_ALLOCATION_ERROR_MESSAGES.DUPLICATE_VEHICLE_ASSIGNMENT(1),
                },
            });
        });

        it('should reject an unknown milk distributor', async () => {
            const dto = {
                allocations: [],
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 999,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_NOT_FOUND(999),
            );
        });

        it('should reject an unknown non-milk distributor', async () => {
            const dto = {
                allocations: [],
                assignments: [
                    {
                        vehicleId: 1,
                        nonMilkDistributorId: 999,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_NOT_FOUND(999),
            );
        });

        it('should reject a milk allocation without a milk distributor assignment', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.MISSING_MILK_DISTRIBUTOR_ASSIGNMENT(
                    1,
                ),
            );
        });

        it('should reject a non-milk allocation without a non-milk distributor assignment', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.MISSING_NON_MILK_DISTRIBUTOR_ASSIGNMENT(
                    1,
                ),
            );
        });

        it('should reject a milk distributor mismatch', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 20,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                'Milk allocation distributor mismatch for vehicle 1, product 100',
            );
        });

        it('should reject a non-milk distributor mismatch', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                        nonMilkDistributorId: 10,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                'Non-milk allocation distributor mismatch for vehicle 1, product 200',
            );
        });

        it('should reject a distributor that cannot procure a milk product', async () => {
            vehicleAllocationRepository.findDistributorProcurementRules.mockResolvedValue(
                [],
            );

            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 10,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_CANNOT_PROCURE_PRODUCT(
                    10,
                    100,
                ),
            );
        });

        it('should reject a distributor that cannot procure a non-milk product', async () => {
            vehicleAllocationRepository.findDistributorProcurementRules.mockResolvedValue(
                [],
            );

            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 10,
                    },
                ],
                assignments: [
                    {
                        vehicleId: 1,
                        nonMilkDistributorId: 20,
                    },
                ],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_CANNOT_PROCURE_PRODUCT(
                    20,
                    200,
                ),
            );
        });

        it('should ignore zero-quantity allocations when checking assignments', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 999,
                        category: SupplyCategory.MILK,
                        productId: 999,
                        allocatedQty: 0,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateVehicleAssignments(1, dto as any, db),
            ).resolves.toBeUndefined();
        });
    });

    describe('validateVehicleAssignmentsForNightSubmit', () => {
        it('should reject when the vehicle allocation paper does not exist', async () => {
            mockAllocationGrid({
                allocations: [],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            await expect(
                service.validateVehicleAssignmentsForNightSubmit(1, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_ALLOCATIONS_NOT_FOUND,
            );
        });

        it('should resolve when every vehicle with allocation has the corresponding category assignment', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        category: SupplyCategory.MILK,
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 10,
                            },
                        ],
                    },
                ],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                { id: 50 },
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                },
            ]);

            await expect(
                service.validateVehicleAssignmentsForNightSubmit(1, db),
            ).resolves.toBeUndefined();
        });

        it('should ignore vehicles without positive allocations', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        category: SupplyCategory.MILK,
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 0,
                            },
                        ],
                    },
                ],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                { id: 50 },
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue(
                [],
            );

            await expect(
                service.validateVehicleAssignmentsForNightSubmit(1, db),
            ).resolves.toBeUndefined();
        });

        it('should reject a vehicle without a category assignment', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        category: SupplyCategory.MILK,
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 10,
                            },
                        ],
                    },
                ],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                { id: 50 },
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue(
                [],
            );

            await expect(
                service.validateVehicleAssignmentsForNightSubmit(1, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_WITHOUT_CATEGORY_DISTRIBUTOR(
                    1,
                    SupplyCategory.MILK,
                ),
            );
        });

        it('should ignore non-product fields in allocation rows', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        category: SupplyCategory.MILK,
                        rows: [
                            {
                                vehicleId: 1,
                                brandName: 'Brand A',
                                product_100: 0,
                            },
                        ],
                    },
                ],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                { id: 50 },
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue(
                [],
            );

            await expect(
                service.validateVehicleAssignmentsForNightSubmit(1, db),
            ).resolves.toBeUndefined();
        });
    });

    describe('validateVehicleAllocationsForMorningSubmit', () => {
        it('should resolve when morning allocations exactly match required quantities', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        brand: {
                            name: 'Brand A',
                        },
                        totals: {
                            product_100: 30,
                        },
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 10,
                            },
                            {
                                vehicleId: 2,
                                product_100: 20,
                            },
                        ],
                    },
                ],
            });

            await expect(
                service.validateVehicleAllocationsForMorningSubmit(1, db),
            ).resolves.toBeUndefined();
        });

        it('should reject a morning allocation quantity mismatch', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        brand: {
                            name: 'Brand A',
                        },
                        totals: {
                            product_100: 30,
                        },
                        rows: [
                            {
                                vehicleId: 1,
                                product_100: 20,
                            },
                        ],
                    },
                ],
            });

            await expect(
                service.validateVehicleAllocationsForMorningSubmit(1, db),
            ).rejects.toThrow(
                'Brand A product_100 allocation mismatch. Required: 30, Allocated: 20',
            );
        });
    });

    describe('validateVehicleAssignmentsForMorningSubmit', () => {
        it('should reject when the vehicle allocation paper does not exist', async () => {
            mockAllocationGrid({
                allocations: [],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            await expect(
                service.validateVehicleAssignmentsForMorningSubmit(1, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_ALLOCATIONS_NOT_FOUND,
            );
        });

        it('should resolve when every allocated vehicle has a category assignment', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        category: SupplyCategory.NON_MILK,
                        rows: [
                            {
                                vehicleId: 2,
                                product_200: 10,
                            },
                        ],
                    },
                ],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                { id: 50 },
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 2,
                    category: SupplyCategory.NON_MILK,
                },
            ]);

            await expect(
                service.validateVehicleAssignmentsForMorningSubmit(1, db),
            ).resolves.toBeUndefined();
        });

        it('should reject a vehicle without a category assignment', async () => {
            mockAllocationGrid({
                allocations: [
                    {
                        category: SupplyCategory.NON_MILK,
                        rows: [
                            {
                                vehicleId: 2,
                                product_200: 10,
                            },
                        ],
                    },
                ],
            });

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                { id: 50 },
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue(
                [],
            );

            await expect(
                service.validateVehicleAssignmentsForMorningSubmit(1, db),
            ).rejects.toThrow(
                VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_WITHOUT_CATEGORY_DISTRIBUTOR(
                    2,
                    SupplyCategory.NON_MILK,
                ),
            );
        });
    });

    describe('validateAllocationProductLinks', () => {
        it('should resolve when every positive allocation has an active product link', async () => {
            vehicleAllocationRepository.getProductLink.mockResolvedValue({
                id: 1,
            });

            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 25,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateAllocationProductLinks(dto as any, db),
            ).resolves.toBeUndefined();

            expect(
                vehicleAllocationRepository.getProductLink,
            ).toHaveBeenCalledWith(10, 100, db, true);
        });

        it('should ignore zero-quantity allocations', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 0,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateAllocationProductLinks(dto as any, db),
            ).resolves.toBeUndefined();

            expect(
                vehicleAllocationRepository.getProductLink,
            ).not.toHaveBeenCalled();
        });

        it('should ignore negative-quantity allocations', async () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: -5,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateAllocationProductLinks(dto as any, db),
            ).resolves.toBeUndefined();

            expect(
                vehicleAllocationRepository.getProductLink,
            ).not.toHaveBeenCalled();
        });

        it('should reject a positive allocation without an active product link', async () => {
            vehicleAllocationRepository.getProductLink.mockResolvedValue(null);

            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 25,
                    },
                ],
                assignments: [],
            };

            await expect(
                service.validateAllocationProductLinks(dto as any, db),
            ).rejects.toThrow('Invalid product allocations');
        });

        it('should report all invalid product links in a single exception', async () => {
            vehicleAllocationRepository.getProductLink.mockResolvedValue(null);

            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 25,
                    },
                    {
                        vehicleId: 2,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 15,
                    },
                ],
                assignments: [],
            };

            try {
                await service.validateAllocationProductLinks(dto as any, db);
                throw new Error('Expected validation to fail');
            } catch (error) {
                expect(error).toBeInstanceOf(BadRequestException);

                const response = (error as BadRequestException).getResponse();

                expect(response).toEqual({
                    message: 'Invalid product allocations',
                    details: [
                        'Distributor 10 does not have an active link to Product 100',
                        'Distributor 20 does not have an active link to Product 200',
                    ],
                });
            }
        });
    });

    describe('validateNoDuplicateAllocations', () => {
        it('should resolve when all allocation combinations are unique', () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 101,
                        allocatedQty: 20,
                    },
                ],
                assignments: [],
            };

            expect(() =>
                service.validateNoDuplicateAllocations(dto as any),
            ).not.toThrow();
        });

        it('should reject duplicate vehicle-distributor-category-product combinations', () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 20,
                    },
                ],
                assignments: [],
            };

            expect(() =>
                service.validateNoDuplicateAllocations(dto as any),
            ).toThrow(
                'Duplicate allocation entries found: 1_10_MILK_100. Each vehicle-distributor-category-product combination can only appear once.',
            );
        });

        it('should report multiple duplicate combinations', () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 20,
                    },
                    {
                        vehicleId: 2,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 5,
                    },
                    {
                        vehicleId: 2,
                        distributorId: 20,
                        category: SupplyCategory.NON_MILK,
                        productId: 200,
                        allocatedQty: 15,
                    },
                ],
                assignments: [],
            };

            expect(() =>
                service.validateNoDuplicateAllocations(dto as any),
            ).toThrow(
                'Duplicate allocation entries found: 1_10_MILK_100, 2_20_NON_MILK_200. Each vehicle-distributor-category-product combination can only appear once.',
            );
        });

        it('should consider category part of the uniqueness key', () => {
            const dto = {
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 100,
                        allocatedQty: 10,
                    },
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.NON_MILK,
                        productId: 100,
                        allocatedQty: 20,
                    },
                ],
                assignments: [],
            };

            expect(() =>
                service.validateNoDuplicateAllocations(dto as any),
            ).not.toThrow();
        });
    });

    /**
     * Mock the private getAllocationGrid() dependencies through their
     * collaborators instead of accessing the private method directly.
     */
    function mockAllocationGrid(grid: any) {
        orderItemsRepository.getOrderItemsWithSupplyContextByPaperId.mockResolvedValue(
            [],
        );

        allocationSummaryBuilder.build.mockReturnValue([]);

        vehicleAllocationRepository.findVehicles.mockResolvedValue([]);

        vehicleAllocationBuilder.buildVehicleAllocationGrids.mockReturnValue(
            grid,
        );

        vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
            null,
        );

        vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([]);

        vehicleAllocationBuilder.applyVehicleAllocations.mockReturnValue(grid);
    }
});