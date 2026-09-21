import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DeliverySession, SupplyCategory } from '../../../generated/prisma/client.js';
import {
    assertSeedDataPresent,
    resetPaperData,
    testPrisma,
} from '../../../../test/helper/db.js';

/**
 * Layer 3 (plan §9) — direct raw-insert violations against real Postgres,
 * independent of application-level validation, for the three schema
 * constraints this module depends on.
 */
describe('Vehicle Allocation schema invariants (plan §9)', () => {
    beforeAll(async () => {
        await assertSeedDataPresent();
    });

    afterAll(async () => {
        await resetPaperData();
        await testPrisma.$disconnect();
    });

    async function createOrderPaperAndAllocationPaper(orderDateOffset: number) {
        const date = new Date(Date.UTC(2091, 0, orderDateOffset));

        const orderPaper = await testPrisma.order_paper.create({
            data: { order_date: date, sale_date: date },
        });

        const allocationPaper = await testPrisma.vehicle_allocation_paper.create({
            data: {
                order_paper_id: orderPaper.id,
                delivery_session: DeliverySession.NIGHT,
            },
        });

        return { orderPaper, allocationPaper };
    }

    it('rejects a duplicate vehicle_allocation row for (paper, vehicle, distributor, category, product)', async () => {
        const { allocationPaper } = await createOrderPaperAndAllocationPaper(1);

        const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
            where: { vehicle_number: 'MH01AA1001' },
        });
        const distributor = await testPrisma.master_distributor.findFirstOrThrow({
            where: { name: 'Distributor A' },
        });
        const product = await testPrisma.master_product.findFirstOrThrow({
            where: { code: 'GOV-COW-500' },
        });

        await testPrisma.vehicle_allocation.create({
            data: {
                vehicle_allocation_paper_id: allocationPaper.id,
                vehicle_id: vehicle.id,
                distributor_id: distributor.id,
                category: SupplyCategory.MILK,
                product_id: product.id,
                allocated_qty: 10,
            },
        });

        await expect(
            testPrisma.vehicle_allocation.create({
                data: {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle.id,
                    distributor_id: distributor.id,
                    category: SupplyCategory.MILK,
                    product_id: product.id,
                    allocated_qty: 20,
                },
            }),
        ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects a duplicate vehicle_distribution_assignment row for (paper, vehicle, category)', async () => {
        const { allocationPaper } = await createOrderPaperAndAllocationPaper(2);

        const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
            where: { vehicle_number: 'MH01AA1001' },
        });
        const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
            where: { name: 'Distributor A' },
        });
        const distributorB = await testPrisma.master_distributor.findFirstOrThrow({
            where: { name: 'Distributor B' },
        });

        await testPrisma.vehicle_distribution_assignment.create({
            data: {
                vehicle_allocation_paper_id: allocationPaper.id,
                vehicle_id: vehicle.id,
                distributor_id: distributorA.id,
                category: SupplyCategory.MILK,
            },
        });

        // Same vehicle, same category, DIFFERENT distributor — the
        // constraint must still reject it, since a vehicle cannot have
        // two assignments for the same category regardless of distributor.
        await expect(
            testPrisma.vehicle_distribution_assignment.create({
                data: {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle.id,
                    distributor_id: distributorB.id,
                    category: SupplyCategory.MILK,
                },
            }),
        ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allows the same vehicle to have separate MILK and NON_MILK assignments on the same paper', async () => {
        const { allocationPaper } = await createOrderPaperAndAllocationPaper(3);

        const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
            where: { vehicle_number: 'MH01AA1001' },
        });
        const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
            where: { name: 'Distributor A' },
        });
        const distributorC = await testPrisma.master_distributor.findFirstOrThrow({
            where: { name: 'Distributor C' },
        });

        await testPrisma.vehicle_distribution_assignment.create({
            data: {
                vehicle_allocation_paper_id: allocationPaper.id,
                vehicle_id: vehicle.id,
                distributor_id: distributorA.id,
                category: SupplyCategory.MILK,
            },
        });

        await expect(
            testPrisma.vehicle_distribution_assignment.create({
                data: {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle.id,
                    distributor_id: distributorC.id,
                    category: SupplyCategory.NON_MILK,
                },
            }),
        ).resolves.toBeDefined();
    });

    it('rejects a duplicate vehicle_allocation_paper row for (order_paper_id, delivery_session)', async () => {
        const date = new Date(Date.UTC(2091, 0, 4));

        const orderPaper = await testPrisma.order_paper.create({
            data: { order_date: date, sale_date: date },
        });

        await testPrisma.vehicle_allocation_paper.create({
            data: {
                order_paper_id: orderPaper.id,
                delivery_session: DeliverySession.NIGHT,
            },
        });

        await expect(
            testPrisma.vehicle_allocation_paper.create({
                data: {
                    order_paper_id: orderPaper.id,
                    delivery_session: DeliverySession.NIGHT,
                },
            }),
        ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allows the same order_paper to have separate NIGHT and MORNING allocation papers', async () => {
        const date = new Date(Date.UTC(2091, 0, 5));

        const orderPaper = await testPrisma.order_paper.create({
            data: { order_date: date, sale_date: date },
        });

        await testPrisma.vehicle_allocation_paper.create({
            data: {
                order_paper_id: orderPaper.id,
                delivery_session: DeliverySession.NIGHT,
            },
        });

        await expect(
            testPrisma.vehicle_allocation_paper.create({
                data: {
                    order_paper_id: orderPaper.id,
                    delivery_session: DeliverySession.MORNING,
                },
            }),
        ).resolves.toBeDefined();
    });
});