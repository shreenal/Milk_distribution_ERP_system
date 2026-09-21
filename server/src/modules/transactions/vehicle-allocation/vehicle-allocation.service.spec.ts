import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { DeliverySession, SupplyCategory } from '../../../generated/prisma/client.js';
import { VEHICLE_ALLOCATION_ERROR_MESSAGES } from './vehicle-allocation.constants.js';

const withSerializableRetryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../common/prisma/with-serializable-retry.js', () => ({
    withSerializableRetry: withSerializableRetryMock,
}));

describe('VehicleAllocationService', () => {
    let service: VehicleAllocationService;

    let vehicleAllocationRepository: any;
    let vehicleAllocationBuilder: any;
    let allocationSummaryBuilder: any;
    let orderItemsRepository: any;
    let vehicleAllocationValidationService: any;
    let workflowState: any;
    let workflowBuilder: any;
    let prisma: any;
    let tx: any;

    const paper = {
        id: 1,
        status: 'IN_PROGRESS',
    };

    const vehicles = [
        {
            id: 1,
            vehicle_name: 'Vehicle 1',
        },
        {
            id: 2,
            vehicle_name: 'Vehicle 2',
        },
    ];

    const distributors = [
        {
            id: 10,
            name: 'Distributor A',
        },
        {
            id: 20,
            name: 'Distributor B',
        },
    ];

    const summaries = [
        {
            distributorId: 10,
            category: SupplyCategory.MILK,
            brandId: 100,
            brandName: 'Brand A',
            products: [],
            rows: [],
        },
    ];

    const assignmentGrid = {
        assignments: [
            {
                vehicleId: 1,
                vehicleName: 'Vehicle 1',
                milkDistributorId: null,
                nonMilkDistributorId: null,
            },
        ],
        distributors: [
            {
                id: 10,
                name: 'Distributor A',
            },
        ],
    };

    const allocationGrids = {
        allocations: [
            {
                distributor: { id: 10 },
                category: SupplyCategory.MILK,
                brand: { id: 100, name: 'Brand A' },
                columns: [],
                rows: [],
                totals: {},
            },
        ],
    };

    const requirementGrids = [
        {
            distributor: { id: 10 },
            category: SupplyCategory.MILK,
            brand: { id: 100, name: 'Brand A' },
            columns: [],
            rows: [],
            totals: {},
        },
    ];

    const workflow = {
        canEdit: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();

        vehicleAllocationRepository = {
            findOrderPaperById: vi.fn(),
            findVehicles: vi.fn(),
            findDistributors: vi.fn(),
            findVehicleAllocationPaper: vi.fn(),
            findVehicleAllocations: vi.fn(),
            findVehicleAssignments: vi.fn(),
            getOrCreateVehicleAllocationPaper: vi.fn(),
            replaceVehicleAssignments: vi.fn(),
            replaceVehicleAllocations: vi.fn(),
            touchVehicleAllocationPaperIfUnchanged: vi.fn(),
        };

        vehicleAllocationBuilder = {
            buildVehicleAssignmentGrid: vi.fn(),
            buildVehicleAllocationGrids: vi.fn(),
            buildVehicleRequirementGrids: vi.fn(),
            applyVehicleAllocations: vi.fn(),
            applyVehicleAssignments: vi.fn(),
        };

        allocationSummaryBuilder = {
            build: vi.fn(),
        };

        orderItemsRepository = {
            getOrderItemsWithSupplyContextByPaperId: vi.fn(),
        };

        vehicleAllocationValidationService = {
            validateVehicleAssignments: vi.fn(),
            validateAllocationProductLinks: vi.fn(),
            validateVehicleAllocations: vi.fn(),
            validateNoDuplicateAllocations: vi.fn(),
        };

        workflowState = {
            getActiveExecutionSession: vi.fn(),
            canEditVehicleAllocations: vi.fn(),
        };

        workflowBuilder = {
            buildVehicleAllocationWorkflow: vi.fn(),
        };

        tx = {
            vehicle_allocation_paper: {
                update: vi.fn(),
            },
        };

        prisma = {
            $transaction: vi.fn(),
        };

        service = new VehicleAllocationService(
            vehicleAllocationRepository,
            vehicleAllocationBuilder,
            allocationSummaryBuilder,
            orderItemsRepository,
            vehicleAllocationValidationService,
            workflowState,
            workflowBuilder,
            prisma,
        );

        withSerializableRetryMock.mockImplementation(
            async (operation: () => Promise<unknown>) => operation(),
        );

        prisma.$transaction.mockImplementation(
            async (
                callback: (transaction: typeof tx) => Promise<unknown>,
            ) => callback(tx),
        );
    });

    describe('getVehicleAllocations', () => {
        beforeEach(() => {
            vehicleAllocationRepository.findOrderPaperById.mockResolvedValue(paper);

            orderItemsRepository.getOrderItemsWithSupplyContextByPaperId.mockResolvedValue(
                [],
            );

            allocationSummaryBuilder.build.mockReturnValue(summaries);

            workflowState.getActiveExecutionSession.mockReturnValue(
                DeliverySession.MORNING,
            );

            vehicleAllocationRepository.findVehicles.mockResolvedValue(vehicles);
            vehicleAllocationRepository.findDistributors.mockResolvedValue(
                distributors,
            );

            vehicleAllocationBuilder.buildVehicleAssignmentGrid.mockReturnValue(
                assignmentGrid,
            );

            vehicleAllocationBuilder.buildVehicleAllocationGrids.mockReturnValue(
                allocationGrids,
            );

            vehicleAllocationBuilder.buildVehicleRequirementGrids.mockReturnValue(
                requirementGrids,
            );

            workflowBuilder.buildVehicleAllocationWorkflow.mockReturnValue(
                workflow,
            );
        });

        it('should reject when the order paper does not exist', async () => {
            vehicleAllocationRepository.findOrderPaperById.mockResolvedValue(null);

            await expect(
                service.getVehicleAllocations(999, DeliverySession.MORNING),
            ).rejects.toBeInstanceOf(BadRequestException);

            await expect(
                service.getVehicleAllocations(999, DeliverySession.MORNING),
            ).rejects.toMatchObject({
                response: {
                    message: VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
                },
            });
        });

        it('should run the read inside a Prisma transaction', async () => {
            await service.getVehicleAllocations(1, DeliverySession.MORNING);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(
                vehicleAllocationRepository.findOrderPaperById,
            ).toHaveBeenCalledWith(1, tx);
        });

        it('should load summaries, vehicles and distributors for the requested session', async () => {
            await service.getVehicleAllocations(1, DeliverySession.MORNING);

            expect(
                orderItemsRepository.getOrderItemsWithSupplyContextByPaperId,
            ).toHaveBeenCalledWith(1, tx);

            expect(allocationSummaryBuilder.build).toHaveBeenCalledWith(
                [],
                DeliverySession.MORNING,
            );

            expect(
                vehicleAllocationRepository.findVehicles,
            ).toHaveBeenCalledWith(tx);

            expect(
                vehicleAllocationRepository.findDistributors,
            ).toHaveBeenCalledWith(tx);
        });

        it('should build assignment, allocation and requirement grids', async () => {
            await service.getVehicleAllocations(1, DeliverySession.MORNING);

            expect(
                vehicleAllocationBuilder.buildVehicleAssignmentGrid,
            ).toHaveBeenCalledWith(vehicles, distributors);

            expect(
                vehicleAllocationBuilder.buildVehicleAllocationGrids,
            ).toHaveBeenCalledWith(summaries, vehicles);

            expect(
                vehicleAllocationBuilder.buildVehicleRequirementGrids,
            ).toHaveBeenCalledWith(summaries);
        });

        it('should build the workflow using paper status and requested session', async () => {
            await service.getVehicleAllocations(1, DeliverySession.MORNING);

            expect(
                workflowBuilder.buildVehicleAllocationWorkflow,
            ).toHaveBeenCalledWith(
                paper.status,
                DeliverySession.MORNING,
            );
        });

        it('should return empty saved state when no vehicle allocation paper exists', async () => {
            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            const result = await service.getVehicleAllocations(
                1,
                DeliverySession.MORNING,
            );

            expect(result).toEqual({
                paper,
                workflow,
                allocations: allocationGrids.allocations,
                requirementGrids,
                vehicleAssignments: assignmentGrid,
                vehicleAllocationPaperUpdatedAt: null,
            });

            expect(
                vehicleAllocationRepository.findVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.findVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationBuilder.applyVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationBuilder.applyVehicleAssignments,
            ).not.toHaveBeenCalled();
        });

        it('should load saved allocations and assignments when the allocation paper exists', async () => {
            const allocationPaper = {
                id: 50,
                updated_at: new Date('2026-01-01T10:00:00.000Z'),
            };

            const savedAllocations = [
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: 5,
                },
            ];

            const savedAssignments = [
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                },
            ];

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                allocationPaper,
            );

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue(
                savedAllocations,
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue(
                savedAssignments,
            );

            vehicleAllocationBuilder.applyVehicleAllocations.mockReturnValue({
                allocations: ['applied allocations'],
            });

            vehicleAllocationBuilder.applyVehicleAssignments.mockReturnValue({
                assignments: ['applied assignments'],
            });

            const result = await service.getVehicleAllocations(
                1,
                DeliverySession.MORNING,
            );

            expect(
                vehicleAllocationRepository.findVehicleAllocations,
            ).toHaveBeenCalledWith(50, tx);

            expect(
                vehicleAllocationRepository.findVehicleAssignments,
            ).toHaveBeenCalledWith(50, tx);

            expect(
                vehicleAllocationBuilder.applyVehicleAllocations,
            ).toHaveBeenCalledWith(
                allocationGrids,
                savedAllocations,
            );

            expect(
                vehicleAllocationBuilder.applyVehicleAssignments,
            ).toHaveBeenCalledWith(
                assignmentGrid,
                savedAssignments,
            );

            expect(result).toEqual({
                paper,
                workflow,
                allocations: ['applied allocations'],
                requirementGrids,
                vehicleAssignments: {
                    assignments: ['applied assignments'],
                },
                vehicleAllocationPaperUpdatedAt: allocationPaper.updated_at,
            });
        });

        it('should pass the requested session to findVehicleAllocationPaper', async () => {
            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            await service.getVehicleAllocations(1, DeliverySession.NIGHT);

            expect(
                vehicleAllocationRepository.findVehicleAllocationPaper,
            ).toHaveBeenCalledWith(1, DeliverySession.NIGHT, tx);
        });

        it('should return the exact paper and workflow objects produced by dependencies', async () => {
            const customWorkflow = {
                step: 'vehicle-allocation',
                editable: false,
            };

            workflowBuilder.buildVehicleAllocationWorkflow.mockReturnValue(
                customWorkflow,
            );

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            const result = await service.getVehicleAllocations(
                1,
                DeliverySession.MORNING,
            );

            expect(result.paper).toBe(paper);
            expect(result.workflow).toBe(customWorkflow);
        });
    });

    describe('saveVehicleAllocations', () => {
        const dto = {
            assignments: [
                {
                    vehicleId: 1,
                    milkDistributorId: 10,
                    nonMilkDistributorId: null,
                },
            ],
            allocations: [
                {
                    vehicleId: 1,
                    distributorId: 10,
                    category: SupplyCategory.MILK,
                    productId: 1000,
                    allocatedQty: 5,
                },
            ],
        };

        const allocationPaper = {
            id: 50,
            updated_at: new Date('2026-01-01T10:00:00.000Z'),
        };

        beforeEach(() => {
            vehicleAllocationRepository.findOrderPaperById.mockResolvedValue(paper);

            workflowState.getActiveExecutionSession.mockReturnValue(
                DeliverySession.MORNING,
            );

            workflowState.canEditVehicleAllocations.mockReturnValue(true);

            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                allocationPaper,
            );

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue(
                [],
            );

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue(
                [],
            );

            vehicleAllocationRepository.getOrCreateVehicleAllocationPaper.mockResolvedValue(
                allocationPaper,
            );

            vehicleAllocationRepository.touchVehicleAllocationPaperIfUnchanged.mockResolvedValue(
                { count: 1 },
            );

            vehicleAllocationValidationService.validateVehicleAssignments.mockResolvedValue(
                undefined,
            );

            vehicleAllocationValidationService.validateAllocationProductLinks.mockResolvedValue(
                undefined,
            );

            vehicleAllocationValidationService.validateVehicleAllocations.mockResolvedValue(
                undefined,
            );
        });

        it('should reject when the order paper does not exist', async () => {
            vehicleAllocationRepository.findOrderPaperById.mockResolvedValue(null);

            await expect(
                service.saveVehicleAllocations(999, dto as any),
            ).rejects.toMatchObject({
                response: {
                    message: VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
                },
            });

            expect(
                vehicleAllocationValidationService.validateVehicleAssignments,
            ).not.toHaveBeenCalled();
        });

        it('should use the active execution session from the paper status', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                workflowState.getActiveExecutionSession,
            ).toHaveBeenCalledWith(paper.status);
        });

        it('should reject when editing vehicle allocations is not allowed', async () => {
            workflowState.canEditVehicleAllocations.mockReturnValue(false);

            await expect(
                service.saveVehicleAllocations(1, dto as any),
            ).rejects.toMatchObject({
                response: {
                    message: VEHICLE_ALLOCATION_ERROR_MESSAGES.EDIT_NOT_ALLOWED,
                },
            });

            expect(
                vehicleAllocationValidationService.validateVehicleAssignments,
            ).not.toHaveBeenCalled();
        });

        it('should check edit permission using status and active session', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                workflowState.canEditVehicleAllocations,
            ).toHaveBeenCalledWith(
                paper.status,
                DeliverySession.MORNING,
            );
        });

        it('should reject a stale expectedUpdatedAt value', async () => {
            const staleDto = {
                ...dto,
                expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
            };

            await expect(
                service.saveVehicleAllocations(1, staleDto as any),
            ).rejects.toBeInstanceOf(ConflictException);

            await expect(
                service.saveVehicleAllocations(1, staleDto as any),
            ).rejects.toMatchObject({
                response: {
                    message:
                        'Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.',
                },
            });

            expect(
                vehicleAllocationValidationService.validateVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.getOrCreateVehicleAllocationPaper,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(tx.vehicle_allocation_paper.update).not.toHaveBeenCalled();
        });

        it('should allow the save when expectedUpdatedAt matches the existing paper', async () => {
            const matchingDto = {
                ...dto,
                expectedUpdatedAt: allocationPaper.updated_at.toISOString(),
            };

            await service.saveVehicleAllocations(1, matchingDto as any);

            expect(
                vehicleAllocationValidationService.validateVehicleAssignments,
            ).toHaveBeenCalled();
        });

        it('should not reject expectedUpdatedAt when no existing allocation paper exists', async () => {
            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            await expect(
                service.saveVehicleAllocations(1, {
                    ...dto,
                    expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
                } as any),
            ).resolves.toEqual({
                success: true,
                changed: true,
            });
        });

        it('should reject with ConflictException when atomic optimistic concurrency check fails', async () => {
            vehicleAllocationRepository.touchVehicleAllocationPaperIfUnchanged.mockResolvedValue(
                { count: 0 },
            );

            const matchingDto = {
                ...dto,
                expectedUpdatedAt: allocationPaper.updated_at.toISOString(),
            };

            await expect(
                service.saveVehicleAllocations(1, matchingDto as any),
            ).rejects.toBeInstanceOf(ConflictException);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();
        });

        it('should perform the atomic optimistic concurrency check before persistence', async () => {
            const matchingDto = {
                ...dto,
                expectedUpdatedAt: allocationPaper.updated_at.toISOString(),
            };

            await service.saveVehicleAllocations(1, matchingDto as any);

            expect(
                vehicleAllocationRepository.touchVehicleAllocationPaperIfUnchanged,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                allocationPaper.updated_at,
                tx,
            );
        });

        it('should run all validation steps before creating the allocation paper', async () => {
            const calls: string[] = [];

            vehicleAllocationValidationService.validateVehicleAssignments.mockImplementation(
                async () => {
                    calls.push('assignments');
                },
            );

            vehicleAllocationValidationService.validateAllocationProductLinks.mockImplementation(
                async () => {
                    calls.push('product-links');
                },
            );

            vehicleAllocationValidationService.validateVehicleAllocations.mockImplementation(
                async () => {
                    calls.push('allocations');
                },
            );

            vehicleAllocationValidationService.validateNoDuplicateAllocations.mockImplementation(
                () => {
                    calls.push('duplicates');
                },
            );

            vehicleAllocationRepository.getOrCreateVehicleAllocationPaper.mockImplementation(
                async () => {
                    calls.push('create-paper');
                    return allocationPaper;
                },
            );

            await service.saveVehicleAllocations(1, dto as any);

            expect(calls).toEqual([
                'assignments',
                'product-links',
                'allocations',
                'duplicates',
                'create-paper',
            ]);
        });

        it('should call every validation service with the transaction', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationValidationService.validateVehicleAssignments,
            ).toHaveBeenCalledWith(1, dto, tx);

            expect(
                vehicleAllocationValidationService.validateAllocationProductLinks,
            ).toHaveBeenCalledWith(dto, tx);

            expect(
                vehicleAllocationValidationService.validateVehicleAllocations,
            ).toHaveBeenCalledWith(1, dto, tx);

            expect(
                vehicleAllocationValidationService.validateNoDuplicateAllocations,
            ).toHaveBeenCalledWith(dto);
        });

        it('should create the allocation paper using the active session', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.getOrCreateVehicleAllocationPaper,
            ).toHaveBeenCalledWith(
                1,
                DeliverySession.MORNING,
                tx,
            );
        });

        it('should transform milk distributor assignment into an assignment row', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                [
                    {
                        vehicle_allocation_paper_id: allocationPaper.id,
                        vehicle_id: 1,
                        category: SupplyCategory.MILK,
                        distributor_id: 10,
                    },
                ],
                tx,
            );
        });

        it('should transform non-milk distributor assignment into an assignment row', async () => {
            const nonMilkDto = {
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: null,
                        nonMilkDistributorId: 20,
                    },
                ],
                allocations: [],
            };

            await service.saveVehicleAllocations(1, nonMilkDto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                [
                    {
                        vehicle_allocation_paper_id: allocationPaper.id,
                        vehicle_id: 1,
                        category: SupplyCategory.NON_MILK,
                        distributor_id: 20,
                    },
                ],
                tx,
            );
        });

        it('should transform both category assignments for one vehicle', async () => {
            const bothDto = {
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 10,
                        nonMilkDistributorId: 20,
                    },
                ],
                allocations: [],
            };

            await service.saveVehicleAllocations(1, bothDto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                [
                    {
                        vehicle_allocation_paper_id: allocationPaper.id,
                        vehicle_id: 1,
                        category: SupplyCategory.MILK,
                        distributor_id: 10,
                    },
                    {
                        vehicle_allocation_paper_id: allocationPaper.id,
                        vehicle_id: 1,
                        category: SupplyCategory.NON_MILK,
                        distributor_id: 20,
                    },
                ],
                tx,
            );
        });

        it('should omit null distributor assignments', async () => {
            const emptyDto = {
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: null,
                        nonMilkDistributorId: null,
                    },
                ],
                allocations: [],
            };

            await service.saveVehicleAllocations(1, emptyDto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(tx.vehicle_allocation_paper.update).not.toHaveBeenCalled();
        });

        it('should transform positive allocations into allocation rows', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                [
                    {
                        vehicle_allocation_paper_id: allocationPaper.id,
                        vehicle_id: 1,
                        distributor_id: 10,
                        category: SupplyCategory.MILK,
                        product_id: 1000,
                        allocated_qty: 5,
                    },
                ],
                tx,
            );
        });

        it('should filter zero and negative allocations before persistence', async () => {
            const quantityDto = {
                assignments: [],
                allocations: [
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 1000,
                        allocatedQty: 0,
                    },
                    {
                        vehicleId: 2,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 1000,
                        allocatedQty: -5,
                    },
                    {
                        vehicleId: 1,
                        distributorId: 10,
                        category: SupplyCategory.MILK,
                        productId: 1000,
                        allocatedQty: 7,
                    },
                ],
            };

            await service.saveVehicleAllocations(1, quantityDto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                [
                    {
                        vehicle_allocation_paper_id: allocationPaper.id,
                        vehicle_id: 1,
                        distributor_id: 10,
                        category: SupplyCategory.MILK,
                        product_id: 1000,
                        allocated_qty: 7,
                    },
                ],
                tx,
            );
        });

        it('should call replaceVehicleAssignments when assignments changed', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([]);

            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).toHaveBeenCalledTimes(1);
        });

        it('should call replaceVehicleAllocations when allocations changed', async () => {
            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([]);

            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).toHaveBeenCalledTimes(1);
        });

        it('should not replace assignments when the assignment row set is unchanged', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: 5,
                },
            ]);

            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).not.toHaveBeenCalled();
        });

        it('should not replace allocations when the allocation row set is unchanged', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: 5,
                },
            ]);

            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();
        });

        it('should not touch updated_at when both assignment and allocation row sets are unchanged', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: 5,
                },
            ]);

            const result = await service.saveVehicleAllocations(1, dto as any);

            expect(result).toEqual({
                success: true,
                changed: false,
            });

            expect(tx.vehicle_allocation_paper.update).not.toHaveBeenCalled();
        });

        it('should touch updated_at when assignments change', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([]);

            await service.saveVehicleAllocations(1, dto as any);

            expect(tx.vehicle_allocation_paper.update).toHaveBeenCalledWith({
                where: {
                    id: allocationPaper.id,
                },
                data: {},
            });
        });

        it('should touch updated_at when allocations change', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([]);

            await service.saveVehicleAllocations(1, dto as any);

            expect(tx.vehicle_allocation_paper.update).toHaveBeenCalledWith({
                where: {
                    id: allocationPaper.id,
                },
                data: {},
            });
        });

        it('should report changed=true when assignments change', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 2,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: 5,
                },
            ]);

            const result = await service.saveVehicleAllocations(1, dto as any);

            expect(result).toEqual({
                success: true,
                changed: true,
            });
        });

        it('should report changed=true when allocations change', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: 4,
                },
            ]);

            const result = await service.saveVehicleAllocations(1, dto as any);

            expect(result).toEqual({
                success: true,
                changed: true,
            });
        });

        it('should report changed=true when there was no existing allocation paper', async () => {
            vehicleAllocationRepository.findVehicleAllocationPaper.mockResolvedValue(
                null,
            );

            const result = await service.saveVehicleAllocations(1, dto as any);

            expect(result).toEqual({
                success: true,
                changed: true,
            });
        });

        it('should compare allocation quantities numerically', async () => {
            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([
                {
                    vehicle_id: 1,
                    category: SupplyCategory.MILK,
                    distributor_id: 10,
                },
            ]);

            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([
                {
                    vehicle_id: 1,
                    distributor_id: 10,
                    category: SupplyCategory.MILK,
                    product_id: 1000,
                    allocated_qty: '5',
                },
            ]);

            const result = await service.saveVehicleAllocations(1, dto as any);

            expect(result).toEqual({
                success: true,
                changed: false,
            });

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();
        });

        it('should invoke serializable retry around the transaction', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(withSerializableRetryMock).toHaveBeenCalledTimes(1);
            expect(withSerializableRetryMock).toHaveBeenCalledWith(
                expect.any(Function),
            );
        });

        it('should use the configured transaction options', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(prisma.$transaction).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    timeout: expect.anything(),
                    isolationLevel: expect.anything(),
                }),
            );
        });

        it('should propagate validation failures without performing persistence', async () => {
            vehicleAllocationValidationService.validateVehicleAssignments.mockRejectedValue(
                new BadRequestException('invalid assignment'),
            );

            await expect(
                service.saveVehicleAllocations(1, dto as any),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(
                vehicleAllocationRepository.getOrCreateVehicleAllocationPaper,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(tx.vehicle_allocation_paper.update).not.toHaveBeenCalled();
        });

        it('should not continue to later validations when an earlier validation fails', async () => {
            vehicleAllocationValidationService.validateVehicleAssignments.mockRejectedValue(
                new BadRequestException('invalid assignment'),
            );

            await expect(
                service.saveVehicleAllocations(1, dto as any),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(
                vehicleAllocationValidationService.validateAllocationProductLinks,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationValidationService.validateVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationValidationService.validateNoDuplicateAllocations,
            ).not.toHaveBeenCalled();
        });

        it('should not persist when product-link validation fails', async () => {
            vehicleAllocationValidationService.validateAllocationProductLinks.mockRejectedValue(
                new BadRequestException('invalid product link'),
            );

            await expect(
                service.saveVehicleAllocations(1, dto as any),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(
                vehicleAllocationValidationService.validateVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.getOrCreateVehicleAllocationPaper,
            ).not.toHaveBeenCalled();
        });

        it('should not persist when order-demand validation fails', async () => {
            vehicleAllocationValidationService.validateVehicleAllocations.mockRejectedValue(
                new BadRequestException('invalid allocation'),
            );

            await expect(
                service.saveVehicleAllocations(1, dto as any),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(
                vehicleAllocationValidationService.validateNoDuplicateAllocations,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.getOrCreateVehicleAllocationPaper,
            ).not.toHaveBeenCalled();
        });

        it('should not persist when duplicate allocation validation fails', async () => {
            vehicleAllocationValidationService.validateNoDuplicateAllocations.mockImplementation(
                () => {
                    throw new BadRequestException('duplicate allocation');
                },
            );

            await expect(
                service.saveVehicleAllocations(1, dto as any),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(
                vehicleAllocationRepository.getOrCreateVehicleAllocationPaper,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();
        });

        it('should preserve the allocation paper id when saving', async () => {
            await service.saveVehicleAllocations(1, dto as any);

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                expect.any(Array),
                tx,
            );

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).toHaveBeenCalledWith(
                allocationPaper.id,
                expect.any(Array),
                tx,
            );
        });

        it('should return changed=false for a completely empty save against an empty existing paper', async () => {
            const emptyDto = {
                assignments: [],
                allocations: [],
            };

            vehicleAllocationRepository.findVehicleAssignments.mockResolvedValue([]);
            vehicleAllocationRepository.findVehicleAllocations.mockResolvedValue([]);

            const result = await service.saveVehicleAllocations(
                1,
                emptyDto as any,
            );

            expect(result).toEqual({
                success: true,
                changed: false,
            });

            expect(
                vehicleAllocationRepository.replaceVehicleAssignments,
            ).not.toHaveBeenCalled();

            expect(
                vehicleAllocationRepository.replaceVehicleAllocations,
            ).not.toHaveBeenCalled();

            expect(tx.vehicle_allocation_paper.update).not.toHaveBeenCalled();
        });
    });
});

