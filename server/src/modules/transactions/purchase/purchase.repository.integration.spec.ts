import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    PrismaClient,
    DeliverySession,
    SupplyCategory,
} from '../../../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PurchaseRepository } from './purchase.repository.js';

config({
    path: '.env.test.local',
    override: true,
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error(
        'Test database configuration is missing: DATABASE_URL was not loaded.',
    );
}

const database = new URL(databaseUrl);

if (database.pathname !== '/milk_distribution_test') {
    throw new Error(
        `Refusing to run integration tests against database "${database.pathname.slice(1)}". ` +
        'Expected "milk_distribution_test".',
    );
}

const adapter = new PrismaPg(databaseUrl);
const prisma = new PrismaClient({ adapter });

// The repository constructor expects PrismaService.
// PrismaClient exposes the same Prisma model API required by this repository.
const repository = new PurchaseRepository(prisma as any);

async function getSeedData() {
    const [vehicle1, vehicle2, vehicle3] = await Promise.all([
        prisma.master_vehicle.findUnique({
            where: { vehicle_number: 'MH01AA1001' },
        }),
        prisma.master_vehicle.findUnique({
            where: { vehicle_number: 'MH01AA1002' },
        }),
        prisma.master_vehicle.findUnique({
            where: { vehicle_number: 'MH01AA1003' },
        }),
    ]);

    const [distributorA, distributorB] = await Promise.all([
        prisma.master_distributor.findUnique({
            where: { name: 'Distributor A' },
        }),
        prisma.master_distributor.findUnique({
            where: { name: 'Distributor B' },
        }),
    ]);

    const [productCow500, productCow1000, productCurd] = await Promise.all([
        prisma.master_product.findUnique({
            where: { code: 'GOV-COW-500' },
        }),
        prisma.master_product.findUnique({
            where: { code: 'GOV-COW-1000' },
        }),
        prisma.master_product.findUnique({
            where: { code: 'GOV-CURD-CUP-200' },
        }),
    ]);

    if (
        !vehicle1 ||
        !vehicle2 ||
        !vehicle3 ||
        !distributorA ||
        !distributorB ||
        !productCow500 ||
        !productCow1000 ||
        !productCurd
    ) {
        throw new Error(
            'Purchase integration seed is incomplete. ' +
            'Expected vehicles, distributors, and products were not found.',
        );
    }

    const productLinkA500 = await prisma.master_product_link.findUnique({
        where: {
            distributor_id_product_id: {
                distributor_id: distributorA.id,
                product_id: productCow500.id,
            },
        },
    });

    const productLinkA1000 = await prisma.master_product_link.findUnique({
        where: {
            distributor_id_product_id: {
                distributor_id: distributorA.id,
                product_id: productCow1000.id,
            },
        },
    });

    const productLinkB500 = await prisma.master_product_link.findUnique({
        where: {
            distributor_id_product_id: {
                distributor_id: distributorB.id,
                product_id: productCow500.id,
            },
        },
    });

    if (!productLinkA500 || !productLinkA1000 || !productLinkB500) {
        throw new Error(
            'Purchase integration seed is incomplete. ' +
            'Expected product links were not found.',
        );
    }

    return {
        vehicle1,
        vehicle2,
        vehicle3,
        distributorA,
        distributorB,
        productCow500,
        productCow1000,
        productCurd,
        productLinkA500,
        productLinkA1000,
        productLinkB500,
    };
}

let testSequence = 0;

async function createOrderPaper() {
  let sequence = testSequence++;

  while (true) {
    const date = new Date(
      Date.UTC(2100, 0, 1 + sequence),
    );

    const existing = await prisma.order_paper.findUnique({
      where: {
        order_date: date,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return prisma.order_paper.create({
        data: {
          order_date: date,
          sale_date: date,
        },
      });
    }

    sequence++;
  }
}

async function createPurchasePaper(orderPaperId: number) {
    return prisma.purchase_paper.create({
        data: {
            order_paper_id: orderPaperId,
        },
    });
}

async function createPurchaseEntry(params: {
    purchasePaperId: number;
    vehicleId: number;
    distributorId: number;
    category: SupplyCategory;
    productId: number;
    productLinkId: number;
    deliverySession: DeliverySession;
    gatepassDate: Date;
    purchasedQty: string | number;
    purchaseRate: string | number;
    purchaseAmount: string | number;
    sourceAllocationId?: number | null;
    sourceAllocatedQty?: string | number | null;
}) {
    return prisma.purchase_entry.create({
        data: {
            purchase_paper_id: params.purchasePaperId,
            vehicle_id: params.vehicleId,
            distributor_id: params.distributorId,
            category: params.category,
            product_id: params.productId,
            product_link_id: params.productLinkId,
            delivery_session: params.deliverySession,
            gatepass_date: params.gatepassDate,
            purchased_qty: params.purchasedQty,
            purchase_rate: params.purchaseRate,
            purchase_amount: params.purchaseAmount,
            source_allocation_id: params.sourceAllocationId ?? null,
            source_allocated_qty: params.sourceAllocatedQty ?? null,
        },
    });
}

async function getEntries(purchasePaperId: number) {
    return prisma.purchase_entry.findMany({
        where: {
            purchase_paper_id: purchasePaperId,
        },
        orderBy: {
            id: 'asc',
        },
    });
}

function makeEntry(params: {
    purchasePaperId: number;
    vehicleId: number;
    distributorId: number;
    category: SupplyCategory;
    productId: number;
    productLinkId: number;
    deliverySession: DeliverySession;
    gatepassDate: Date;
    purchasedQty: string | number;
    purchaseRate: string | number;
    purchaseAmount: string | number;
    sourceAllocationId?: number | null;
    sourceAllocatedQty?: string | number | null;
}) {
    return {
        purchase_paper_id: params.purchasePaperId,
        vehicle_id: params.vehicleId,
        distributor_id: params.distributorId,
        category: params.category,
        product_id: params.productId,
        product_link_id: params.productLinkId,
        delivery_session: params.deliverySession,
        gatepass_date: params.gatepassDate,
        purchased_qty: params.purchasedQty,
        purchase_rate: params.purchaseRate,
        purchase_amount: params.purchaseAmount,
        source_allocation_id: params.sourceAllocationId ?? null,
        source_allocated_qty: params.sourceAllocatedQty ?? null,
    };
}

async function createVehicleAllocation(params: {
    orderPaperId: number;
    vehicleId: number;
    distributorId: number;
    category: SupplyCategory;
    productId: number;
    allocatedQty: string | number;
}) {
    const allocationPaper =
        await prisma.vehicle_allocation_paper.upsert({
            where: {
                order_paper_id_delivery_session: {
                    order_paper_id: params.orderPaperId,
                    delivery_session: DeliverySession.NIGHT,
                },
            },
            update: {},
            create: {
                order_paper_id: params.orderPaperId,
                delivery_session: DeliverySession.NIGHT,
            },
        });

    return prisma.vehicle_allocation.create({
        data: {
            vehicle_allocation_paper_id: allocationPaper.id,
            vehicle_id: params.vehicleId,
            distributor_id: params.distributorId,
            category: params.category,
            product_id: params.productId,
            allocated_qty: params.allocatedQty,
        },
    });
}


describe('PurchaseRepository - PostgreSQL integration', () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });


    describe('replacePurchaseEntries', () => {
        it('updates an existing purchase entry in place and preserves its id', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const sourceAllocation = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                allocatedQty: '15.00',
            });

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-01'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
                sourceAllocationId: sourceAllocation.id,
                sourceAllocatedQty: '15.00',
            });

            const before = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(before).not.toBeNull();

            await new Promise((resolve) => setTimeout(resolve, 20));


            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-01'),
                    purchasedQty: '12.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '300.00',
                    sourceAllocationId: sourceAllocation.id,
                    sourceAllocatedQty: '15.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after).not.toBeNull();
            expect(after!.id).toBe(existing.id);
            expect(Number(after!.purchased_qty)).toBe(12);
            expect(Number(after!.purchase_amount)).toBe(300);
            expect(after!.updated_at.getTime()).toBeGreaterThan(
                before!.updated_at.getTime(),
            );
        });

        it('leaves unchanged rows completely untouched', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const sourceAllocation = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                allocatedQty: '15.00',
            });

            const changedSourceAllocation = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                allocatedQty: '25.00',
            });

            const unchanged = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-02'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
                sourceAllocationId: sourceAllocation.id,
                sourceAllocatedQty: '10.00',
            });

            const changed = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-02'),
                purchasedQty: '20.00',
                purchaseRate: '30.00',
                purchaseAmount: '600.00',
                sourceAllocationId: changedSourceAllocation.id,
                sourceAllocatedQty: '20.00',
            });

            const beforeUnchanged = await prisma.purchase_entry.findUnique({
                where: { id: unchanged.id },
            });

            const beforeChanged = await prisma.purchase_entry.findUnique({
                where: { id: changed.id },
            });

            expect(beforeUnchanged).not.toBeNull();
            expect(beforeChanged).not.toBeNull();

            await new Promise((resolve) => setTimeout(resolve, 20));

            await repository.replacePurchaseEntries(purchasePaper.id, [
                // This row is completely identical to the existing row.
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-02'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                    sourceAllocationId: sourceAllocation.id,
                    sourceAllocatedQty: '10.00',
                }),

                // Only the mutable values are changed for this row.
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle2.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow1000.id,
                    productLinkId: productLinkA1000.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-02'),
                    purchasedQty: '25.00',
                    purchaseRate: '30.00',
                    purchaseAmount: '750.00',
                    sourceAllocationId: changedSourceAllocation.id,
                    sourceAllocatedQty: '25.00',
                }),
            ]);

            const afterUnchanged = await prisma.purchase_entry.findUnique({
                where: { id: unchanged.id },
            });

            const afterChanged = await prisma.purchase_entry.findUnique({
                where: { id: changed.id },
            });

            expect(afterUnchanged).not.toBeNull();
            expect(afterChanged).not.toBeNull();

            // Unchanged row must preserve identity and timestamp.
            expect(afterUnchanged!.id).toBe(unchanged.id);
            expect(Number(afterUnchanged!.purchased_qty)).toBe(10);
            expect(Number(afterUnchanged!.purchase_rate)).toBe(25);
            expect(Number(afterUnchanged!.purchase_amount)).toBe(250);
            expect(afterUnchanged!.source_allocation_id).toBe(
                sourceAllocation.id,
            );
            expect(Number(afterUnchanged!.source_allocated_qty)).toBe(10);
            expect(afterUnchanged!.updated_at.getTime()).toBe(
                beforeUnchanged!.updated_at.getTime(),
            );

            // Changed row must preserve identity but receive the new values.
            expect(afterChanged!.id).toBe(changed.id);
            expect(Number(afterChanged!.purchased_qty)).toBe(25);
            expect(Number(afterChanged!.purchase_rate)).toBe(30);
            expect(Number(afterChanged!.purchase_amount)).toBe(750);
            expect(afterChanged!.source_allocation_id).toBe(
                changedSourceAllocation.id,
            );
            expect(Number(afterChanged!.source_allocated_qty)).toBe(25);
            expect(afterChanged!.updated_at.getTime()).toBeGreaterThan(
                beforeChanged!.updated_at.getTime(),
            );
        });

        it('inserts genuinely new purchase combinations', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-03'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-03'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                }),
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle2.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow1000.id,
                    productLinkId: productLinkA1000.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-03'),
                    purchasedQty: '15.50',
                    purchaseRate: '30.00',
                    purchaseAmount: '465.00',
                }),
            ]);

            const rows = await getEntries(purchasePaper.id);

            expect(rows).toHaveLength(2);

            const existingAfter = rows.find((row) => row.id === existing.id);
            const inserted = rows.find(
                (row) =>
                    row.vehicle_id === vehicle2.id &&
                    row.product_id === productCow1000.id,
            );

            expect(existingAfter).toBeDefined();
            expect(inserted).toBeDefined();
            expect(Number(inserted!.purchased_qty)).toBe(15.5);
            expect(inserted!.id).not.toBe(existing.id);
        });

        it('deletes purchase entries that are no longer present', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const kept = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-04'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            const removed = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-04'),
                purchasedQty: '20.00',
                purchaseRate: '30.00',
                purchaseAmount: '600.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-04'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                }),
            ]);

            const rows = await getEntries(purchasePaper.id);

            expect(rows).toHaveLength(1);
            expect(rows[0].id).toBe(kept.id);

            const deleted = await prisma.purchase_entry.findUnique({
                where: { id: removed.id },
            });

            expect(deleted).toBeNull();
        });

        it('deletes all existing purchase entries when incoming data is empty', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-05'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-05'),
                purchasedQty: '20.00',
                purchaseRate: '30.00',
                purchaseAmount: '600.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, []);

            const rows = await getEntries(purchasePaper.id);

            expect(rows).toEqual([]);
        });

        it('does not touch entries belonging to another purchase paper', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper1 = await createOrderPaper();
            const orderPaper2 = await createOrderPaper();

            const paper1 = await createPurchasePaper(orderPaper1.id);
            const paper2 = await createPurchasePaper(orderPaper2.id);

            const target = await createPurchaseEntry({
                purchasePaperId: paper1.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-06'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            const unrelated = await createPurchaseEntry({
                purchasePaperId: paper2.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-06'),
                purchasedQty: '50.00',
                purchaseRate: '30.00',
                purchaseAmount: '1500.00',
            });

            const beforeUnrelated = await prisma.purchase_entry.findUnique({
                where: { id: unrelated.id },
            });

            await repository.replacePurchaseEntries(paper1.id, [
                makeEntry({
                    purchasePaperId: paper1.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-06'),
                    purchasedQty: '30.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '750.00',
                }),
            ]);

            const afterUnrelated = await prisma.purchase_entry.findUnique({
                where: { id: unrelated.id },
            });

            expect(afterUnrelated!.id).toBe(unrelated.id);
            expect(Number(afterUnrelated!.purchased_qty)).toBe(50);
            expect(afterUnrelated!.updated_at.getTime()).toBe(
                beforeUnrelated!.updated_at.getTime(),
            );

            const targetAfter = await prisma.purchase_entry.findUnique({
                where: { id: target.id },
            });

            expect(targetAfter!.id).toBe(target.id);
            expect(Number(targetAfter!.purchased_qty)).toBe(30);
        });

        it('uses the vehicle, distributor, category, product, and session combination as identity', async () => {
            const {
                vehicle1,
                distributorA,
                distributorB,
                productCow500,
                productLinkA500,
                productLinkB500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const distributorAEntry = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-07'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            const distributorBEntry = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorB.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkB500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-07'),
                purchasedQty: '20.00',
                purchaseRate: '26.00',
                purchaseAmount: '520.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-07'),
                    purchasedQty: '15.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '375.00',
                }),
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorB.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkB500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-07'),
                    purchasedQty: '25.00',
                    purchaseRate: '26.00',
                    purchaseAmount: '650.00',
                }),
            ]);

            const rows = await getEntries(purchasePaper.id);

            expect(rows).toHaveLength(2);

            const afterA = rows.find((row) => row.id === distributorAEntry.id);
            const afterB = rows.find((row) => row.id === distributorBEntry.id);

            expect(afterA).toBeDefined();
            expect(afterB).toBeDefined();

            expect(afterA!.distributor_id).toBe(distributorA.id);
            expect(Number(afterA!.purchased_qty)).toBe(15);

            expect(afterB!.distributor_id).toBe(distributorB.id);
            expect(Number(afterB!.purchased_qty)).toBe(25);
        });

        it('updates independently when source_allocation_id changes', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const sourceAllocation1 = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                allocatedQty: '10.00',
            });

            const sourceAllocation2 = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                allocatedQty: '10.00',
            });

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-08'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
                sourceAllocationId: sourceAllocation1.id,
                sourceAllocatedQty: '10.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-08'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                    sourceAllocationId: sourceAllocation2.id,
                    sourceAllocatedQty: '10.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(after!.source_allocation_id).toBe(sourceAllocation2.id);
        });

        it('updates independently when source_allocated_qty changes', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const sourceAllocation = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                allocatedQty: '15.00',
            });

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-09'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
                sourceAllocationId: sourceAllocation.id,
                sourceAllocatedQty: '10.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-09'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                    sourceAllocationId: sourceAllocation.id,
                    sourceAllocatedQty: '15.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(Number(after!.source_allocated_qty)).toBe(15);
        });

        it('updates independently when tray_type_id changes', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-10'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            const trayTypes = await prisma.master_tray_type.findMany({
                take: 2,
                orderBy: { id: 'asc' },
            });

            if (trayTypes.length < 2) {
                throw new Error(
                    'Purchase integration seed requires at least two master tray types.',
                );
            }

            await prisma.purchase_entry.update({
                where: { id: existing.id },
                data: {
                    tray_type_id: trayTypes[0].id,
                },
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-10'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                    sourceAllocationId: null,
                    sourceAllocatedQty: null,
                }),
            ].map((entry) => ({
                ...entry,
                tray_type_id: trayTypes[1].id,
            })));

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(after!.tray_type_id).toBe(trayTypes[1].id);
        });

        it('updates independently when product_link_id changes', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-11'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            // product_link_id is intentionally changed independently of the
            // logical identity fields. The repository must detect it as a
            // mutable comparator.
            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA1000.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-11'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(after!.product_link_id).toBe(productLinkA1000.id);
            expect(after!.product_id).toBe(productCow500.id);
            expect(productCow1000.id).not.toBe(productCow500.id);
        });

        it('updates independently when gatepass_date changes', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-12'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-13'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(after!.gatepass_date.getTime()).toBe(
                new Date('2090-02-13').getTime(),
            );
        });

        it('updates independently when purchase_rate changes', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-14'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-14'),
                    purchasedQty: '10.00',
                    purchaseRate: '26.50',
                    purchaseAmount: '265.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(Number(after!.purchase_rate)).toBe(26.5);
            expect(Number(after!.purchase_amount)).toBe(265);
        });

        it('updates independently when purchase_amount changes', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-15'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-15'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '255.00',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after!.id).toBe(existing.id);
            expect(Number(after!.purchase_amount)).toBe(255);
        });

        it('preserves Decimal quantities and monetary values correctly', async () => {
            const {
                vehicle1,
                distributorA,
                productCow500,
                productLinkA500,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-16'),
                purchasedQty: '10.25',
                purchaseRate: '25.75',
                purchaseAmount: '263.94',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-16'),
                    purchasedQty: '123.45',
                    purchaseRate: '25.75',
                    purchaseAmount: '3178.89',
                }),
            ]);

            const after = await prisma.purchase_entry.findUnique({
                where: { id: existing.id },
            });

            expect(after).not.toBeNull();
            expect(Number(after!.purchased_qty)).toBe(123.45);
            expect(Number(after!.purchase_rate)).toBe(25.75);
            expect(Number(after!.purchase_amount)).toBe(3178.89);
        });

        it('performs delete, update, and insert together', async () => {
            const {
                vehicle1,
                vehicle2,
                vehicle3,
                distributorA,
                productCow500,
                productCow1000,
                productCurd,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const kept = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-17'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            const changed = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-17'),
                purchasedQty: '20.00',
                purchaseRate: '30.00',
                purchaseAmount: '600.00',
            });

            const removed = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle3.id,
                distributorId: distributorA.id,
                category: SupplyCategory.NON_MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-17'),
                purchasedQty: '5.00',
                purchaseRate: '40.00',
                purchaseAmount: '200.00',
            });

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-17'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                }),
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle2.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow1000.id,
                    productLinkId: productLinkA1000.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-17'),
                    purchasedQty: '35.00',
                    purchaseRate: '30.00',
                    purchaseAmount: '1050.00',
                }),
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle3.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.NON_MILK,
                    productId: productCurd.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-17'),
                    purchasedQty: '7.00',
                    purchaseRate: '40.00',
                    purchaseAmount: '280.00',
                }),
            ]);

            const rows = await getEntries(purchasePaper.id);

            expect(rows).toHaveLength(3);

            const keptAfter = rows.find((row) => row.id === kept.id);
            const changedAfter = rows.find((row) => row.id === changed.id);
            const removedAfter = rows.find((row) => row.id === removed.id);

            expect(keptAfter).toBeDefined();
            expect(changedAfter).toBeDefined();
            expect(removedAfter).toBeUndefined();

            expect(Number(changedAfter!.purchased_qty)).toBe(35);
            expect(Number(changedAfter!.purchase_amount)).toBe(1050);

            const inserted = rows.find(
                (row) =>
                    row.vehicle_id === vehicle3.id &&
                    row.product_id === productCurd.id,
            );

            expect(inserted).toBeDefined();
            expect(inserted!.id).not.toBe(removed.id);
            expect(Number(inserted!.purchased_qty)).toBe(7);
        });

        it('is a true no-op when incoming entries are identical', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const sourceAllocation1 = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                allocatedQty: '10.00',
            });

            const sourceAllocation2 = await createVehicleAllocation({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                allocatedQty: '20.00',
            });

            const first = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-18'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
                sourceAllocationId: sourceAllocation1.id,
                sourceAllocatedQty: '10.00',
            });

            const second = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-18'),
                purchasedQty: '20.00',
                purchaseRate: '30.00',
                purchaseAmount: '600.00',
                sourceAllocationId: sourceAllocation2.id,
                sourceAllocatedQty: '20.00',
            });

            const before = await getEntries(purchasePaper.id);

            await new Promise((resolve) => setTimeout(resolve, 20));

            await repository.replacePurchaseEntries(purchasePaper.id, [
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle1.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow500.id,
                    productLinkId: productLinkA500.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-18'),
                    purchasedQty: '10.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '250.00',
                    sourceAllocationId:sourceAllocation1.id,
                    sourceAllocatedQty: '10.00',
                }),
                makeEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle2.id,
                    distributorId: distributorA.id,
                    category: SupplyCategory.MILK,
                    productId: productCow1000.id,
                    productLinkId: productLinkA1000.id,
                    deliverySession: DeliverySession.NIGHT,
                    gatepassDate: new Date('2090-02-18'),
                    purchasedQty: '20.00',
                    purchaseRate: '30.00',
                    purchaseAmount: '600.00',
                    sourceAllocationId: sourceAllocation2.id,
                    sourceAllocatedQty: '20.00',
                }),
            ]);

            

            const after = await getEntries(purchasePaper.id);

            expect(after).toHaveLength(2);
            expect(after.map((row) => row.id)).toEqual([
                first.id,
                second.id,
            ]);

            for (const beforeRow of before) {
                const afterRow = after.find((row) => row.id === beforeRow.id);

                expect(afterRow).toBeDefined();
                expect(Number(afterRow!.purchased_qty)).toBe(
                    Number(beforeRow.purchased_qty),
                );
                expect(Number(afterRow!.purchase_rate)).toBe(
                    Number(beforeRow.purchase_rate),
                );
                expect(Number(afterRow!.purchase_amount)).toBe(
                    Number(beforeRow.purchase_amount),
                );
                expect(afterRow!.updated_at.getTime()).toBe(
                    beforeRow.updated_at.getTime(),
                );
            }
        });
    });

    describe('replacePurchaseEntries transaction behavior', () => {
        it('rolls back the entire diff when the surrounding transaction fails', async () => {
            const {
                vehicle1,
                vehicle2,
                distributorA,
                productCow500,
                productCow1000,
                productLinkA500,
                productLinkA1000,
            } = await getSeedData();

            const orderPaper = await createOrderPaper();
            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existing = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle1.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow500.id,
                productLinkId: productLinkA500.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-19'),
                purchasedQty: '10.00',
                purchaseRate: '25.00',
                purchaseAmount: '250.00',
            });

            const unrelated = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle2.id,
                distributorId: distributorA.id,
                category: SupplyCategory.MILK,
                productId: productCow1000.id,
                productLinkId: productLinkA1000.id,
                deliverySession: DeliverySession.NIGHT,
                gatepassDate: new Date('2090-02-19'),
                purchasedQty: '20.00',
                purchaseRate: '30.00',
                purchaseAmount: '600.00',
            });

            const before = await getEntries(purchasePaper.id);

            await expect(
                prisma.$transaction(async (tx) => {
                    const txRepository = new PurchaseRepository(tx as any);

                    await txRepository.replacePurchaseEntries(purchasePaper.id, [
                        makeEntry({
                            purchasePaperId: purchasePaper.id,
                            vehicleId: vehicle1.id,
                            distributorId: distributorA.id,
                            category: SupplyCategory.MILK,
                            productId: productCow500.id,
                            productLinkId: productLinkA500.id,
                            deliverySession: DeliverySession.NIGHT,
                            gatepassDate: new Date('2090-02-19'),
                            purchasedQty: '99.00',
                            purchaseRate: '25.00',
                            purchaseAmount: '2475.00',
                        }),
                    ]);

                    throw new Error('forced transaction failure');
                }),
            ).rejects.toThrow('forced transaction failure');

            const after = await getEntries(purchasePaper.id);

            expect(after).toHaveLength(2);
            expect(after.map((row) => row.id)).toEqual(
                before.map((row) => row.id),
            );

            const restoredExisting = after.find(
                (row) => row.id === existing.id,
            );
            const restoredUnrelated = after.find(
                (row) => row.id === unrelated.id,
            );

            expect(restoredExisting).toBeDefined();
            expect(restoredUnrelated).toBeDefined();

            expect(Number(restoredExisting!.purchased_qty)).toBe(10);
            expect(Number(restoredExisting!.purchase_amount)).toBe(250);

            expect(Number(restoredUnrelated!.purchased_qty)).toBe(20);
            expect(Number(restoredUnrelated!.purchase_amount)).toBe(600);
        });
    });
});

