import { describe, expect, it, vi, beforeEach } from 'vitest';

import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { DeliverySession, SupplyCategory } from '../../../generated/prisma/client.js';

describe('VehicleAllocationRepository', () => {
    let repository: VehicleAllocationRepository;
    let db: any;

    beforeEach(() => {
        db = {
            order_paper: {
                findUnique: vi.fn(),
            },
            distributor_procurement_rule: {
                findMany: vi.fn(),
            },
            order_sheet: {
                findMany: vi.fn(),
            },
            order_sheet_items: {
                findMany: vi.fn(),
            },
            master_distributor: {
                findMany: vi.fn(),
            },
            master_product: {
                findMany: vi.fn(),
            },
            master_vehicle: {
                findMany: vi.fn(),
            },
            vehicle_allocation_paper: {
                upsert: vi.fn(),
                findUnique: vi.fn(),
            },
            vehicle_allocation: {
                findMany: vi.fn(),
                deleteMany: vi.fn(),
                createMany: vi.fn(),
                update: vi.fn(),
            },
            vehicle_distribution_assignment: {
                findMany: vi.fn(),
                deleteMany: vi.fn(),
                createMany: vi.fn(),
            },
            master_product_link: {
                findUnique: vi.fn(),
            },
        };

        repository = new VehicleAllocationRepository(db);
    });

    describe('findOrderPaperById', () => {
        it('should find an order paper by id', async () => {
            db.order_paper.findUnique.mockResolvedValue({ id: 1 });

            const result = await repository.findOrderPaperById(1, db);

            expect(result).toEqual({ id: 1 });

            expect(db.order_paper.findUnique).toHaveBeenCalledWith({
                where: {
                    id: 1,
                },
            });
        });

        it('should return null when the order paper does not exist', async () => {
            db.order_paper.findUnique.mockResolvedValue(null);

            const result = await repository.findOrderPaperById(999, db);

            expect(result).toBeNull();
        });
    });

    describe('findDistributorProcurementRules', () => {
        it('should return only active procurement rules', async () => {
            db.distributor_procurement_rule.findMany.mockResolvedValue([]);

            await repository.findDistributorProcurementRules(db);

            expect(
                db.distributor_procurement_rule.findMany,
            ).toHaveBeenCalledWith({
                where: {
                    is_active: true,
                },
            });
        });
    });

    describe('findOrderSheetsByPaperId', () => {
        it('should find order sheets for the paper with master group data', async () => {
            db.order_sheet.findMany.mockResolvedValue([]);

            await repository.findOrderSheetsByPaperId(10, db);

            expect(db.order_sheet.findMany).toHaveBeenCalledWith({
                where: {
                    order_paper_id: 10,
                },
                include: {
                    master_group: {
                        select: {
                            id: true,
                            name: true,
                            delivery_session: true,
                        },
                    },
                },
            });
        });
    });

    describe('findSheetItemsByPaperId', () => {
        it('should find sheet items through their order sheet', async () => {
            db.order_sheet_items.findMany.mockResolvedValue([]);

            await repository.findSheetItemsByPaperId(10, db);

            expect(db.order_sheet_items.findMany).toHaveBeenCalledWith({
                where: {
                    order_sheet: {
                        order_paper_id: 10,
                    },
                },
                include: {
                    master_product: {
                        include: {
                            master_brand: true,
                            master_product_group: true,
                            master_product_type: true,
                            master_packaging_type: true,
                        },
                    },
                },
            });
        });
    });

    describe('findDistributors', () => {
        it('should return active distributors ordered by id ascending', async () => {
            db.master_distributor.findMany.mockResolvedValue([]);

            await repository.findDistributors(db);

            expect(db.master_distributor.findMany).toHaveBeenCalledWith({
                where: {
                    is_active: true,
                },
                orderBy: {
                    id: 'asc',
                },
            });
        });
    });

    describe('findProducts', () => {
        it('should return products with all required master data ordered by id', async () => {
            db.master_product.findMany.mockResolvedValue([]);

            await repository.findProducts(db);

            expect(db.master_product.findMany).toHaveBeenCalledWith({
                include: {
                    master_brand: true,
                    master_product_group: true,
                    master_product_type: true,
                    master_packaging_type: true,
                },
                orderBy: {
                    id: 'asc',
                },
            });
        });
    });

    describe('findVehicles', () => {
        it('should return only active vehicles', async () => {
            db.master_vehicle.findMany.mockResolvedValue([]);

            await repository.findVehicles(db);

            expect(db.master_vehicle.findMany).toHaveBeenCalledWith({
                where: {
                    is_active: true,
                },
            });
        });
    });

    describe('getOrCreateVehicleAllocationPaper', () => {
        it('should upsert using order paper and delivery session', async () => {
            db.vehicle_allocation_paper.upsert.mockResolvedValue({
                id: 50,
            });

            const result = await repository.getOrCreateVehicleAllocationPaper(
                10,
                DeliverySession.NIGHT,
                db,
            );

            expect(result).toEqual({ id: 50 });

            expect(db.vehicle_allocation_paper.upsert).toHaveBeenCalledWith({
                where: {
                    order_paper_id_delivery_session: {
                        order_paper_id: 10,
                        delivery_session: DeliverySession.NIGHT,
                    },
                },
                update: {},
                create: {
                    order_paper_id: 10,
                    delivery_session: DeliverySession.NIGHT,
                },
            });
        });

        it('should use the same unique key for both lookup and creation', async () => {
            db.vehicle_allocation_paper.upsert.mockResolvedValue({ id: 1 });

            await repository.getOrCreateVehicleAllocationPaper(
                25,
                DeliverySession.MORNING,
                db,
            );

            const call = db.vehicle_allocation_paper.upsert.mock.calls[0][0];

            expect(call.where.order_paper_id_delivery_session).toEqual({
                order_paper_id: 25,
                delivery_session: DeliverySession.MORNING,
            });

            expect(call.create).toEqual({
                order_paper_id: 25,
                delivery_session: DeliverySession.MORNING,
            });
        });
    });

    describe('deleteVehicleAllocations', () => {
        it('should delete all allocations belonging to the allocation paper', async () => {
            db.vehicle_allocation.deleteMany.mockResolvedValue({
                count: 3,
            });

            const result = await repository.deleteVehicleAllocations(50, db);

            expect(result).toEqual({ count: 3 });

            expect(db.vehicle_allocation.deleteMany).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper_id: 50,
                },
            });
        });
    });

    describe('createVehicleAllocations', () => {
        it('should create allocations using createMany', async () => {
            const data = [
                {
                    vehicle_allocation_paper_id: 50,
                    vehicle_id: 1,
                    distributor_id: 100,
                    category: SupplyCategory.MILK,
                    product_id: 10,
                    allocated_qty: 5,
                },
            ] as any;

            db.vehicle_allocation.createMany.mockResolvedValue({
                count: 1,
            });

            const result = await repository.createVehicleAllocations(data, db);

            expect(result).toEqual({ count: 1 });

            expect(db.vehicle_allocation.createMany).toHaveBeenCalledWith({
                data,
            });
        });
    });

    describe('findVehicleAllocations', () => {
        it('should find allocations for an allocation paper with related vehicle and product', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue([]);

            await repository.findVehicleAllocations(50, db);

            expect(db.vehicle_allocation.findMany).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper_id: 50,
                },
                include: {
                    master_vehicle: true,
                    master_product: true,
                },
                orderBy: [
                    { vehicle_id: 'asc' },
                    { distributor_id: 'asc' },
                    { category: 'asc' },
                    { product_id: 'asc' },
                ],
            });
        });
    });

    describe('findVehicleAllocationPaper', () => {
        it('should find an allocation paper by order paper and session', async () => {
            db.vehicle_allocation_paper.findUnique.mockResolvedValue({
                id: 50,
            });

            const result = await repository.findVehicleAllocationPaper(
                10,
                DeliverySession.NIGHT,
                db,
            );

            expect(result).toEqual({ id: 50 });

            expect(db.vehicle_allocation_paper.findUnique).toHaveBeenCalledWith({
                where: {
                    order_paper_id_delivery_session: {
                        order_paper_id: 10,
                        delivery_session: DeliverySession.NIGHT,
                    },
                },
            });
        });
    });

    describe('findVehicleAllocationsByPaperId', () => {
        it('should find allocations through the allocation paper relation', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue([]);

            await repository.findVehicleAllocationsByPaperId(
                10,
                DeliverySession.MORNING,
                db,
            );

            expect(db.vehicle_allocation.findMany).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper: {
                        order_paper_id: 10,
                        delivery_session: DeliverySession.MORNING,
                    },
                },
                include: {
                    master_vehicle: true,
                    master_product: {
                        include: {
                            master_brand: true,
                            master_product_group: true,
                            master_product_type: true,
                            master_packaging_type: true,
                        },
                    },
                },
                orderBy: [
                    { vehicle_id: 'asc' },
                    { distributor_id: 'asc' },
                    { category: 'asc' },
                    { product_id: 'asc' },
                ],
            });
        });
    });

    describe('replaceVehicleAllocations', () => {
        const existingRows = [
            {
                id: 1,
                vehicle_allocation_paper_id: 50,
                vehicle_id: 1,
                distributor_id: 100,
                category: SupplyCategory.MILK,
                product_id: 10,
                allocated_qty: 10,
            },
            {
                id: 2,
                vehicle_allocation_paper_id: 50,
                vehicle_id: 2,
                distributor_id: 100,
                category: SupplyCategory.MILK,
                product_id: 10,
                allocated_qty: 20,
            },
        ];

        it('should delete rows that are no longer present', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue(existingRows);
            db.vehicle_allocation.deleteMany.mockResolvedValue({ count: 1 });

            await repository.replaceVehicleAllocations(
                50,
                [
                    {
                        vehicle_allocation_paper_id: 50,
                        vehicle_id: 1,
                        distributor_id: 100,
                        category: SupplyCategory.MILK,
                        product_id: 10,
                        allocated_qty: 10,
                    },
                ] as any,
                db,
            );

            expect(db.vehicle_allocation.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: {
                        in: [2],
                    },
                },
            });
        });

        it('should update an existing row when only its quantity changes', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue(existingRows);
            db.vehicle_allocation.update.mockResolvedValue({ id: 1 });

            await repository.replaceVehicleAllocations(
                50,
                [
                    {
                        vehicle_allocation_paper_id: 50,
                        vehicle_id: 1,
                        distributor_id: 100,
                        category: SupplyCategory.MILK,
                        product_id: 10,
                        allocated_qty: 15,
                    },
                    {
                        vehicle_allocation_paper_id: 50,
                        vehicle_id: 2,
                        distributor_id: 100,
                        category: SupplyCategory.MILK,
                        product_id: 10,
                        allocated_qty: 20,
                    },
                ] as any,
                db,
            );

            expect(db.vehicle_allocation.update).toHaveBeenCalledTimes(1);
            expect(db.vehicle_allocation.update).toHaveBeenCalledWith({
                where: {
                    id: 1,
                },
                data: {
                    allocated_qty: 15,
                },
            });
        });

        it('should insert genuinely new allocation combinations', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue(existingRows);
            db.vehicle_allocation.createMany.mockResolvedValue({ count: 1 });

            const newRow = {
                vehicle_allocation_paper_id: 50,
                vehicle_id: 3,
                distributor_id: 100,
                category: SupplyCategory.MILK,
                product_id: 10,
                allocated_qty: 30,
            };

            await repository.replaceVehicleAllocations(
                50,
                [...existingRows, newRow] as any,
                db,
            );

            expect(db.vehicle_allocation.createMany).toHaveBeenCalledWith({
                data: [newRow],
            });
        });

        it('should do nothing when incoming data is byte-for-byte equivalent to existing rows', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue(existingRows);

            await repository.replaceVehicleAllocations(
                50,
                existingRows as any,
                db,
            );

            expect(db.vehicle_allocation.deleteMany).not.toHaveBeenCalled();
            expect(db.vehicle_allocation.update).not.toHaveBeenCalled();
            expect(db.vehicle_allocation.createMany).not.toHaveBeenCalled();
        });

        it('should compare allocation identity using vehicle, distributor, category and product', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue([
                existingRows[0],
            ]);
            db.vehicle_allocation.update.mockResolvedValue({ id: 1 });

            await repository.replaceVehicleAllocations(
                50,
                [
                    {
                        vehicle_allocation_paper_id: 50,
                        vehicle_id: 1,
                        distributor_id: 200,
                        category: SupplyCategory.MILK,
                        product_id: 10,
                        allocated_qty: 10,
                    },
                ] as any,
                db,
            );

            expect(db.vehicle_allocation.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: {
                        in: [1],
                    },
                },
            });

            expect(db.vehicle_allocation.createMany).toHaveBeenCalledWith({
                data: [
                    {
                        vehicle_allocation_paper_id: 50,
                        vehicle_id: 1,
                        distributor_id: 200,
                        category: SupplyCategory.MILK,
                        product_id: 10,
                        allocated_qty: 10,
                    },
                ],
            });
        });

        it('should treat category as part of allocation identity', async () => {
            const existing = {
                ...existingRows[0],
                category: SupplyCategory.MILK,
            };

            db.vehicle_allocation.findMany.mockResolvedValue([existing]);
            db.vehicle_allocation.createMany.mockResolvedValue({ count: 1 });
            db.vehicle_allocation.deleteMany.mockResolvedValue({ count: 1 });

            const incoming = {
                vehicle_allocation_paper_id: 50,
                vehicle_id: existing.vehicle_id,
                distributor_id: existing.distributor_id,
                category: SupplyCategory.NON_MILK,
                product_id: existing.product_id,
                allocated_qty: existing.allocated_qty,
            };

            await repository.replaceVehicleAllocations(
                50,
                [incoming] as any,
                db,
            );

            expect(db.vehicle_allocation.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: {
                        in: [existing.id],
                    },
                },
            });

            expect(db.vehicle_allocation.createMany).toHaveBeenCalledWith({
                data: [incoming],
            });
        });

        it('should treat product as part of allocation identity', async () => {
            const existing = {
                ...existingRows[0],
                product_id: 10,
            };

            db.vehicle_allocation.findMany.mockResolvedValue([existing]);
            db.vehicle_allocation.createMany.mockResolvedValue({ count: 1 });
            db.vehicle_allocation.deleteMany.mockResolvedValue({ count: 1 });

            const incoming = {
                vehicle_allocation_paper_id: 50,
                vehicle_id: existing.vehicle_id,
                distributor_id: existing.distributor_id,
                category: existing.category,
                product_id: 99,
                allocated_qty: existing.allocated_qty,
            };

            await repository.replaceVehicleAllocations(
                50,
                [incoming] as any,
                db,
            );

            expect(db.vehicle_allocation.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: {
                        in: [existing.id],
                    },
                },
            });

            expect(db.vehicle_allocation.createMany).toHaveBeenCalledWith({
                data: [incoming],
            });
        });

        it('should handle an empty incoming allocation list by deleting all existing rows', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue(existingRows);
            db.vehicle_allocation.deleteMany.mockResolvedValue({ count: 2 });

            await repository.replaceVehicleAllocations(50, [], db);

            expect(db.vehicle_allocation.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: {
                        in: [1, 2],
                    },
                },
            });
        });

        it('should not insert anything when incoming data is empty', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue([]);

            await repository.replaceVehicleAllocations(50, [], db);

            expect(db.vehicle_allocation.createMany).not.toHaveBeenCalled();
            expect(db.vehicle_allocation.update).not.toHaveBeenCalled();
        });

        it('should handle quantity values represented as numeric strings', async () => {
            db.vehicle_allocation.findMany.mockResolvedValue([
                {
                    ...existingRows[0],
                    allocated_qty: '10',
                },
            ]);

            await repository.replaceVehicleAllocations(
                50,
                [
                    {
                        vehicle_allocation_paper_id: 50,
                        vehicle_id: 1,
                        distributor_id: 100,
                        category: SupplyCategory.MILK,
                        product_id: 10,
                        allocated_qty: 10,
                    },
                ] as any,
                db,
            );

            expect(db.vehicle_allocation.update).not.toHaveBeenCalled();
            expect(db.vehicle_allocation.createMany).not.toHaveBeenCalled();
            expect(db.vehicle_allocation.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe('findVehicleAssignments', () => {
        it('should find assignments ordered by vehicle and category', async () => {
            db.vehicle_distribution_assignment.findMany.mockResolvedValue([]);

            await repository.findVehicleAssignments(50, db);

            expect(
                db.vehicle_distribution_assignment.findMany,
            ).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper_id: 50,
                },
                include: {
                    master_vehicle: true,
                    master_distributor: true,
                },
                orderBy: [{ vehicle_id: 'asc' }, { category: 'asc' }],
            });
        });
    });

    describe('getProductLink', () => {
        it('should find a product link by distributor and product', async () => {
            db.master_product_link.findUnique.mockResolvedValue({
                id: 1,
            });

            await repository.getProductLink(100, 10, db);

            expect(db.master_product_link.findUnique).toHaveBeenCalledWith({
                where: {
                    distributor_id_product_id: {
                        distributor_id: 100,
                        product_id: 10,
                    },
                },
                select: {
                    id: true,
                    distributor_id: true,
                    product_id: true,
                    is_active: true,
                },
            });
        });

        it('should add an active-only condition when requested', async () => {
            db.master_product_link.findUnique.mockResolvedValue({
                id: 1,
            });

            await repository.getProductLink(100, 10, db, true);

            expect(db.master_product_link.findUnique).toHaveBeenCalledWith({
                where: {
                    distributor_id_product_id: {
                        distributor_id: 100,
                        product_id: 10,
                    },
                    is_active: true,
                },
                select: {
                    id: true,
                    distributor_id: true,
                    product_id: true,
                    is_active: true,
                },
            });
        });

        it('should not add the active condition by default', async () => {
            db.master_product_link.findUnique.mockResolvedValue({
                id: 1,
            });

            await repository.getProductLink(100, 10, db);

            const args =
                db.master_product_link.findUnique.mock.calls[0][0];

            expect(args.where).toEqual({
                distributor_id_product_id: {
                    distributor_id: 100,
                    product_id: 10,
                },
            });
        });
    });

    describe('deleteVehicleAssignments', () => {
        it('should delete all assignments belonging to the allocation paper', async () => {
            db.vehicle_distribution_assignment.deleteMany.mockResolvedValue({
                count: 2,
            });

            const result = await repository.deleteVehicleAssignments(50, db);

            expect(result).toEqual({ count: 2 });

            expect(
                db.vehicle_distribution_assignment.deleteMany,
            ).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper_id: 50,
                },
            });
        });
    });

    describe('createVehicleAssignments', () => {
        it('should create assignments using createMany', async () => {
            const data = [
                {
                    vehicle_allocation_paper_id: 50,
                    vehicle_id: 1,
                    distributor_id: 100,
                    category: SupplyCategory.MILK,
                },
            ] as any;

            db.vehicle_distribution_assignment.createMany.mockResolvedValue({
                count: 1,
            });

            const result = await repository.createVehicleAssignments(data, db);

            expect(result).toEqual({ count: 1 });

            expect(
                db.vehicle_distribution_assignment.createMany,
            ).toHaveBeenCalledWith({
                data,
            });
        });
    });

    describe('replaceVehicleAssignments', () => {
        it('should delete existing assignments before creating new ones', async () => {
            db.vehicle_distribution_assignment.deleteMany.mockResolvedValue({
                count: 2,
            });
            db.vehicle_distribution_assignment.createMany.mockResolvedValue({
                count: 2,
            });

            const data = [
                {
                    vehicle_allocation_paper_id: 50,
                    vehicle_id: 1,
                    distributor_id: 100,
                    category: SupplyCategory.MILK,
                },
                {
                    vehicle_allocation_paper_id: 50,
                    vehicle_id: 2,
                    distributor_id: 200,
                    category: SupplyCategory.NON_MILK,
                },
            ] as any;

            await repository.replaceVehicleAssignments(50, data, db);

            expect(
                db.vehicle_distribution_assignment.deleteMany,
            ).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper_id: 50,
                },
            });

            expect(
                db.vehicle_distribution_assignment.createMany,
            ).toHaveBeenCalledWith({
                data,
            });
        });

        it('should not call createMany when there are no assignments', async () => {
            db.vehicle_distribution_assignment.deleteMany.mockResolvedValue({
                count: 2,
            });

            await repository.replaceVehicleAssignments(50, [], db);

            expect(
                db.vehicle_distribution_assignment.deleteMany,
            ).toHaveBeenCalledWith({
                where: {
                    vehicle_allocation_paper_id: 50,
                },
            });

            expect(
                db.vehicle_distribution_assignment.createMany,
            ).not.toHaveBeenCalled();
        });

        it('should resolve after deleting existing assignments when the incoming list is empty', async () => {
            db.vehicle_distribution_assignment.deleteMany.mockResolvedValue({
                count: 0,
            });

            await expect(
                repository.replaceVehicleAssignments(50, [], db),
            ).resolves.toBeUndefined();
        });
    });
});

