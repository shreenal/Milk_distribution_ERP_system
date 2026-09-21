import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    DeliverySession,
    GatepassDatePolicy,
    PrismaClient,
    SupplyCategory,
} from '../../../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PurchaseRepository } from './purchase.repository.js';
import { PurchaseService } from './purchase.service.js';
import { PURCHASE_ERROR_MESSAGES } from './purchase.constants.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import { DairyTraysPropagationService } from '../dairy-trays/services/dairy-trays-propagation.service.js';
import { DairyTraysRepository } from '../dairy-trays/dairy-trays.repository.js';
import { PurchaseBuilder } from './purchase.builder.js';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';

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

const concurrentAdapter = new PrismaPg(databaseUrl);
const concurrentPrisma = new PrismaClient({ adapter: concurrentAdapter });


const repository = new PurchaseRepository(prisma as any);

let testSequence = 0;

async function getSeedData() {
    const [vehicle, distributor, product] = await Promise.all([
        prisma.master_vehicle.findUnique({
            where: { vehicle_number: 'MH01AA1001' },
        }),
        prisma.master_distributor.findUnique({
            where: { name: 'Distributor A' },
        }),
        prisma.master_product.findUnique({
            where: { code: 'GOV-COW-500' },
            include: {
                master_brand: true,
                master_packaging_type: true,
            },
        }),
    ]);

    if (!vehicle || !distributor || !product) {
        throw new Error(
            'Purchase service integration seed is incomplete. ' +
            'Expected vehicle, distributor, and product were not found.',
        );
    }

    const productLink = await prisma.master_product_link.findUnique({
        where: {
            distributor_id_product_id: {
                distributor_id: distributor.id,
                product_id: product.id,
            },
        },
    });

    if (!productLink) {
        throw new Error(
            'Purchase service integration seed is incomplete. ' +
            'Expected distributor/product link was not found.',
        );
    }

    return {
        vehicle,
        distributor,
        product,
        productLink,
    };
}

async function createOrderPaper() {
    let sequence = testSequence++;

    while (true) {
        const date = new Date(Date.UTC(2100, 5, 1 + sequence));

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

async function createOrderItemFixture(params: {
    orderPaperId: number;
    productId: number;
    productLinkId: number;
    orderedQty?: string;
}) {
    const [group, client] = await Promise.all([
        prisma.master_group.findFirst({
            where: {
                delivery_session: DeliverySession.NIGHT,
            },
        }),
        prisma.master_client.findFirst(),
    ]);

    if (!group || !client) {
        throw new Error(
            'Purchase service integration seed is incomplete. ' +
            'Expected at least one NIGHT master group and client.',
        );
    }

    const orderSheet = await prisma.order_sheet.create({
        data: {
            order_paper_id: params.orderPaperId,
            group_id: group.id,
        },
    });

    return prisma.order_sheet_items.create({
        data: {
            order_sheet_id: orderSheet.id,
            client_id: client.id,
            product_id: params.productId,
            product_link_id: params.productLinkId,
            ordered_qty: params.orderedQty ?? '10.00',
        },
    });
}

async function createNightAllocationPaper(orderPaperId: number) {
    return prisma.vehicle_allocation_paper.upsert({
        where: {
            order_paper_id_delivery_session: {
                order_paper_id: orderPaperId,
                delivery_session: DeliverySession.NIGHT,
            },
        },
        update: {},
        create: {
            order_paper_id: orderPaperId,
            delivery_session: DeliverySession.NIGHT,
        },
    });
}

async function createAllocationFixture(params: {
    orderPaperId: number;
    vehicleId: number;
    distributorId: number;
    productId: number;
    allocatedQty: string;
}) {
    const allocationPaper = await createNightAllocationPaper(
        params.orderPaperId,
    );

    const allocation = await prisma.vehicle_allocation.create({
        data: {
            vehicle_allocation_paper_id: allocationPaper.id,
            vehicle_id: params.vehicleId,
            distributor_id: params.distributorId,
            category: SupplyCategory.MILK,
            product_id: params.productId,
            allocated_qty: params.allocatedQty,
        },
        include: {
            vehicle_allocation_paper: true,
            master_product: {
                include: {
                    master_brand: true,
                    master_packaging_type: true,
                },
            },
        },
    });

    await prisma.vehicle_distribution_assignment.create({
        data: {
            vehicle_allocation_paper_id: allocationPaper.id,
            vehicle_id: params.vehicleId,
            distributor_id: params.distributorId,
            category: SupplyCategory.MILK,
        },
    });

    return allocation;
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
    productId: number;
    productLinkId: number;
    gatepassDate: Date;
    purchasedQty: string;
    purchaseRate: string;
    purchaseAmount: string;
    sourceAllocationId: number;
    sourceAllocatedQty: string;
}) {
    return prisma.purchase_entry.create({
        data: {
            purchase_paper_id: params.purchasePaperId,
            vehicle_id: params.vehicleId,
            distributor_id: params.distributorId,
            category: SupplyCategory.MILK,
            product_id: params.productId,
            product_link_id: params.productLinkId,
            delivery_session: DeliverySession.NIGHT,
            gatepass_date: params.gatepassDate,
            purchased_qty: params.purchasedQty,
            purchase_rate: params.purchaseRate,
            purchase_amount: params.purchaseAmount,
            source_allocation_id: params.sourceAllocationId,
            source_allocated_qty: params.sourceAllocatedQty,
        },
    });
}

/**
 * Temporarily makes the selected product link have no active rate covering
 * the requested effective date.
 *
 * We deliberately save the original rows and restore them in the finally
 * block because the integration database contains shared seed data.
 */
async function makeRateLapsed(params: {
    productLinkId: number;
    effectiveDate: Date;
}) {
    const originalRates = await prisma.distributor_product_rate.findMany({
        where: {
            product_link_id: params.productLinkId,
        },
    });

    await prisma.distributor_product_rate.updateMany({
        where: {
            product_link_id: params.productLinkId,
        },
        data: {
            is_active: false,
        },
    });

    const lapsedEffectiveFrom = new Date(params.effectiveDate);
    lapsedEffectiveFrom.setUTCDate(lapsedEffectiveFrom.getUTCDate() - 10);

    const lapsedEffectiveTo = new Date(params.effectiveDate);
    lapsedEffectiveTo.setUTCDate(lapsedEffectiveTo.getUTCDate() - 1);

    const lapsedRate = await prisma.distributor_product_rate.create({
        data: {
            product_link_id: params.productLinkId,
            purchase_rate: '99.00',
            selling_rate: '99.00',
            effective_from: lapsedEffectiveFrom,
            effective_to: lapsedEffectiveTo,
            is_active: true,
        },
    });

    return {
        lapsedRateId: lapsedRate.id,
        originalRates,
    };
}

async function restoreRates(params: {
    productLinkId: number;
    lapsedRateId: number;
    originalRates: Array<{
        id: number;
        purchase_rate: any;
        selling_rate: any;
        effective_from: Date;
        effective_to: Date | null;
        is_active: boolean;
    }>;
}) {
    await prisma.distributor_product_rate.delete({
        where: {
            id: params.lapsedRateId,
        },
    });

    for (const rate of params.originalRates) {
        await prisma.distributor_product_rate.update({
            where: {
                id: rate.id,
            },
            data: {
                purchase_rate: rate.purchase_rate,
                selling_rate: rate.selling_rate,
                effective_from: rate.effective_from,
                effective_to: rate.effective_to,
                is_active: rate.is_active,
            },
        });
    }
}

function createService() {
    const purchaseBillingService = new PurchaseBillingService();
    const purchaseBuilder = new PurchaseBuilder(
        new ProductColumnsBuilder(),
        new PurchaseVarianceCalculator(),
        purchaseBillingService,
    );

    const allocationSummaryBuilder = new AllocationSummaryBuilder();
    const orderItemsRepository = new OrderItemsRepository(prisma);

    const purchaseValidationService = {
        validateNoDuplicateEntries: vi.fn(),

        validatePurchases: vi
            .fn()
            .mockImplementation(async (paperId, dto, db) => {
                const allocations =
                    await repository.findVehicleAllocationsByPaperId(
                        paperId,
                        db,
                    );

                for (const entry of dto.entries) {
                    if (entry.purchasedQty <= 0) {
                        continue;
                    }

                    const allocation = allocations.find(
                        (allocation) =>
                            allocation.vehicle_id === entry.vehicleId &&
                            allocation.distributor_id === entry.distributorId &&
                            allocation.category === entry.category &&
                            allocation.product_id === entry.productId &&
                            allocation.vehicle_allocation_paper.delivery_session ===
                            entry.deliverySession,
                    );

                    if (!allocation) {
                        throw new Error('Allocation not found');
                    }

                    if (
                        Number(entry.purchasedQty) >
                        Number(allocation.allocated_qty)
                    ) {
                        throw new Error(
                            `Purchased quantity cannot exceed allocated quantity`,
                        );
                    }
                }
            }),
    };

    const purchaseCommercialService = {
        resolveGatepassDateFor: vi
            .fn()
            .mockImplementation((saleDate: Date) => new Date(saleDate)),
    };

    const workflowState = {
        canEditPurchases: vi.fn().mockReturnValue(true),
    };

    const workflowBuilder = {
        buildPurchasesWorkflow: vi.fn().mockReturnValue({}),
    };

    const dependencyOrchestrator = {
        execute: vi.fn(),
    };

    const trayCalculationService = {
        resolveFrozenTrayTypeId: vi.fn(),
        resolveTrayRule: vi.fn(),
        buildTransaction: vi.fn().mockImplementation(
            (openingBalance, traysTaken, traysReturned) => ({
                opening_balance: openingBalance,
                trays_taken: traysTaken,
                trays_returned: traysReturned,
                closing_balance:
                    openingBalance + traysTaken - traysReturned,
            }),
        ),
    };

    const dairyTraysRepository = {
        getProductTrayRules: vi.fn().mockResolvedValue([]),
    };

    const service = new PurchaseService(
        repository,
        purchaseBuilder as any,
        allocationSummaryBuilder as any,
        orderItemsRepository as any,
        purchaseValidationService as any,
        purchaseBillingService as any,
        purchaseCommercialService as any,
        workflowState as any,
        workflowBuilder as any,
        prisma as any,
        dependencyOrchestrator as any,
        trayCalculationService as any,
        dairyTraysRepository as any,
    );

    return {
        service,
        purchaseBuilder,
        purchaseCommercialService,
        trayCalculationService,
    };
}

describe('PurchaseService - PostgreSQL integration', () => {
    beforeAll(async () => {
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });


    it(
        'does not require a live rate for an allocation that already has a saved purchase entry',
        async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            await createOrderItemFixture({
                orderPaperId: orderPaper.id,
                productId: product.id,
                productLinkId: productLink.id,
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const frozenGatepassDate = new Date(orderPaper.sale_date);
            const frozenPurchaseRate = '25.00';
            const frozenPurchaseAmount = '250.00';

            const purchaseEntry = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                productLinkId: productLink.id,
                gatepassDate: frozenGatepassDate,
                purchasedQty: '10.00',
                purchaseRate: frozenPurchaseRate,
                purchaseAmount: frozenPurchaseAmount,
                sourceAllocationId: allocation.id,
                sourceAllocatedQty: '10.00',
            });

            const rateState = await makeRateLapsed({
                productLinkId: productLink.id,
                effectiveDate: frozenGatepassDate,
            });

            try {
                const { service } = createService();

                const productLinkBatchSpy = vi.spyOn(
                    repository,
                    'getProductLinksBatch',
                );

                const rateBatchSpy = vi.spyOn(
                    repository,
                    'findProductLinkRatesForDateBatch',
                );

                const result = await service.getPurchases(orderPaper.id);

                expect(result.hasPurchaseEntries).toBe(true);
                expect(result.orphanedEntries).toEqual([]);

                const purchaseGrid = result.purchases.find(
                    (purchase) =>
                        purchase.distributor.id === distributor.id &&
                        purchase.category === allocation.category,
                );

                expect(purchaseGrid).toBeDefined();

                const purchaseRow = purchaseGrid?.rows.find(
                    (row) =>
                        row.vehicleId === vehicle.id &&
                        row.deliverySession === allocation.vehicle_allocation_paper.delivery_session,
                );

                expect(purchaseRow).toBeDefined();

                expect(purchaseRow).toMatchObject({
                    [`product_${product.id}`]: 10,
                    [`product_${product.id}_rate`]: 25,
                    [`product_${product.id}_amount`]: 250,
                });


                expect(productLinkBatchSpy).toHaveBeenCalledTimes(1);

                const [productLinkRequests] =
                    productLinkBatchSpy.mock.calls[0];

                expect(productLinkRequests).toEqual([]);

                expect(rateBatchSpy).toHaveBeenCalledTimes(1);

                const [rateRequests] =
                    rateBatchSpy.mock.calls[0];

                expect(rateRequests).toEqual([]);

                productLinkBatchSpy.mockRestore();
                rateBatchSpy.mockRestore();
            } finally {
                await restoreRates({
                    productLinkId: productLink.id,
                    lapsedRateId: rateState.lapsedRateId,
                    originalRates: rateState.originalRates,
                });

                await prisma.purchase_entry.delete({
                    where: { id: purchaseEntry.id },
                });

                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });
            }
        },
    );

    it(
        'throws when an unsaved allocation requires a live rate that has lapsed',
        async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const rateState = await makeRateLapsed({
                productLinkId: productLink.id,
                effectiveDate: new Date(orderPaper.sale_date),
            });

            try {
                const { service } = createService();

                await expect(
                    service.getPurchases(orderPaper.id),
                ).rejects.toThrow(
                    `Rate not found for distributor ${distributor.id} product ${product.id} on ${orderPaper.sale_date.toISOString().slice(0, 10)}`,
                );
            } finally {
                await restoreRates({
                    productLinkId: productLink.id,
                    lapsedRateId: rateState.lapsedRateId,
                    originalRates: rateState.originalRates,
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });
            }
        },
    );

    describe('getPurchases - RepeatableRead consistency', () => {
        it(
            'keeps a consistent snapshot when a vehicle allocation is committed during the read',
            async () => {
                const { vehicle, distributor, product } = await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                try {
                    const { service, purchaseBuilder } = createService();

                    /*
                     * Pause getPurchases after its first database read.
                     *
                     * At this point the RepeatableRead transaction has already
                     * established its snapshot.
                     */
                    let releaseFirstRead!: () => void;

                    const firstReadPaused = new Promise<void>((resolve) => {
                        releaseFirstRead = resolve;
                    });

                    let firstReadReached!: () => void;

                    const firstReadStarted = new Promise<void>((resolve) => {
                        firstReadReached = resolve;
                    });

                    const originalFindOrderPaperById =
                        repository.findOrderPaperById.bind(repository);

                    vi.spyOn(repository, 'findOrderPaperById').mockImplementation(
                        async (paperId, db) => {
                            const result = await originalFindOrderPaperById(
                                paperId,
                                db,
                            );

                            firstReadReached();

                            await firstReadPaused;

                            return result;
                        },
                    );

                    const servicePromise = service.getPurchases(orderPaper.id);

                    await firstReadStarted;

                    /*
                     * This write commits while getPurchases() is paused.
                     *
                     * A later query inside the RepeatableRead transaction
                     * must NOT see this newly committed allocation.
                     */
                    const concurrentAllocationPaper =
                        await concurrentPrisma.vehicle_allocation_paper.create({
                            data: {
                                order_paper_id: orderPaper.id,
                                delivery_session: DeliverySession.MORNING,
                            },
                        });

                    await concurrentPrisma.vehicle_allocation.create({
                        data: {
                            vehicle_allocation_paper_id:
                                concurrentAllocationPaper.id,
                            vehicle_id: vehicle.id,
                            distributor_id: distributor.id,
                            category: SupplyCategory.MILK,
                            product_id: product.id,
                            allocated_qty: '20.00',
                        },
                    });

                    /*
                     * Allow the original transaction to continue.
                     */
                    releaseFirstRead();

                    let capturedAllocations: any[] = [];

                    vi.spyOn(
                        purchaseBuilder,
                        'applyVehicleAllocations',
                    ).mockImplementation((grids, allocations) => {
                        capturedAllocations = allocations;
                        return grids;
                    });

                    const result = await servicePromise;

                    const sessions = capturedAllocations.map(
                        (a) => a.vehicle_allocation_paper.delivery_session,
                    );

                    expect(sessions).not.toContain(DeliverySession.MORNING);

                    /*
                     * The transaction started before the concurrent commit,
                     * therefore its snapshot must not contain the newly-created
                     * MORNING allocation.
                     */
                    const allocationPaperSessions =
                        result.purchases.flatMap((purchase) =>
                            purchase.rows.map((row) => row.deliverySession),
                        );

                    expect(allocationPaperSessions).not.toContain(
                        DeliverySession.MORNING,
                    );
                } finally {
                    vi.restoreAllMocks();

                    // Delete only the concurrently-created MORNING allocation.
                    await concurrentPrisma.vehicle_allocation.deleteMany({
                        where: {
                            vehicle_allocation_paper: {
                                order_paper_id: orderPaper.id,
                                delivery_session: DeliverySession.MORNING,
                            },
                        },
                    });

                    await concurrentPrisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            order_paper_id: orderPaper.id,
                            delivery_session: DeliverySession.MORNING,
                        },
                    });

                    // Delete the original NIGHT fixture.
                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            id: allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );
    });

    describe('getPurchases - hasStaleRows', () => {
        it('flags a saved purchase row as stale when source_allocation_id no longer matches', async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            await createOrderItemFixture({
                orderPaperId: orderPaper.id,
                productId: product.id,
                productLinkId: productLink.id,
            });

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const previousOrderPaper = await createOrderPaper();

            const previousAllocation = await createAllocationFixture({
                orderPaperId: previousOrderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                productLinkId: productLink.id,
                gatepassDate: new Date(),
                purchasedQty: '7.00',
                purchaseRate: '25.00',
                purchaseAmount: '175.00',
                sourceAllocationId: previousAllocation.id,
                sourceAllocatedQty: '10.00',
            });

            try {
                const { service, purchaseBuilder } = createService();


                const result = await service.getPurchases(orderPaper.id);

                expect(result.hasStaleRows).toBe(true);

                const staleRows = result.purchases.flatMap((purchase) =>
                    purchase.rows.filter(
                        (row) => row[`product_${product.id}_stale`] === true,
                    ),
                );

                expect(staleRows).toHaveLength(1);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await prisma.purchase_paper.delete({
                    where: {
                        id: purchasePaper.id,
                    },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id: {
                            in: [
                                allocation.vehicle_allocation_paper_id,
                                previousAllocation.vehicle_allocation_paper_id,
                            ],
                        },
                    },
                });

                await prisma.vehicle_allocation.deleteMany({
                    where: {
                        id: {
                            in: [
                                allocation.id,
                                previousAllocation.id,
                            ],
                        },
                    },
                });

                await prisma.vehicle_allocation_paper.deleteMany({
                    where: {
                        id: {
                            in: [
                                allocation.vehicle_allocation_paper_id,
                                previousAllocation.vehicle_allocation_paper_id,
                            ],
                        },
                    },
                });

                await prisma.order_paper.deleteMany({
                    where: {
                        id: {
                            in: [
                                orderPaper.id,
                                previousOrderPaper.id,
                            ],
                        },
                    },
                });

                vi.restoreAllMocks();
            }
        });

        it('flags a saved purchase row as stale when source_allocated_qty no longer matches', async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            await createOrderItemFixture({
                orderPaperId: orderPaper.id,
                productId: product.id,
                productLinkId: productLink.id,
            });

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                productLinkId: productLink.id,
                gatepassDate: new Date(),
                purchasedQty: '7.00',
                purchaseRate: '25.00',
                purchaseAmount: '175.00',
                sourceAllocationId: allocation.id,
                sourceAllocatedQty: '9.00', // deliberately stale
            });

            try {
                const { service } = createService();

                const result = await service.getPurchases(orderPaper.id);

                expect(result.hasStaleRows).toBe(true);

                const staleRows = result.purchases.flatMap((purchase) =>
                    purchase.rows.filter(
                        (row) =>
                            row[`product_${product.id}_stale`] === true,
                    ),
                );

                expect(staleRows).toHaveLength(1);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await prisma.purchase_paper.delete({
                    where: {
                        id: purchasePaper.id,
                    },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: {
                        id: allocation.id,
                    },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: {
                        id: orderPaper.id,
                    },
                });

                vi.restoreAllMocks();
            }
        });

        it('flags a saved purchase row as stale when the current allocation is missing', async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const secondVehicle = await prisma.master_vehicle.findFirst({
                where: {
                    id: {
                        not: vehicle.id,
                    },
                },
            });

            expect(secondVehicle).not.toBeNull();

            const orderPaper = await createOrderPaper();

            await createOrderItemFixture({
                orderPaperId: orderPaper.id,
                productId: product.id,
                productLinkId: productLink.id,
            });

            // Current allocation exists, but only for the first vehicle.
            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            await prisma.vehicle_distribution_assignment.create({
                data: {
                    vehicle_allocation_paper_id:
                        allocation.vehicle_allocation_paper_id,
                    vehicle_id: secondVehicle!.id,
                    distributor_id: distributor.id,
                    category: SupplyCategory.MILK,
                },
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            // Saved purchase is for secondVehicle, for which there is
            // deliberately no current allocation.
            await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: secondVehicle!.id,
                distributorId: distributor.id,
                productId: product.id,
                productLinkId: productLink.id,
                gatepassDate: new Date(),
                purchasedQty: '7.00',
                purchaseRate: '25.00',
                purchaseAmount: '175.00',
                sourceAllocationId: allocation.id,
                sourceAllocatedQty: '10.00',
            });

            try {
                const { service } = createService();

                const result = await service.getPurchases(orderPaper.id);

                expect(result.hasStaleRows).toBe(true);

                const staleRows = result.purchases.flatMap((purchase) =>
                    purchase.rows.filter(
                        (row) =>
                            row[`product_${product.id}_stale`] === true,
                    ),
                );

                expect(staleRows).toHaveLength(1);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await prisma.purchase_paper.delete({
                    where: {
                        id: purchasePaper.id,
                    },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: {
                        id: allocation.id,
                    },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: {
                        id: orderPaper.id,
                    },
                });

                vi.restoreAllMocks();
            }
        });
    });

    describe('getPurchases - morningAllocationPending', () => {
        it(
            'returns true when no MORNING allocation paper exists',
            async () => {
                const { vehicle, distributor, product } =
                    await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                try {
                    const { service } = createService();

                    const result = await service.getPurchases(orderPaper.id);

                    expect(result.morningAllocationPending).toBe(true);
                } finally {
                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            id: allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );

        it(
            'returns false when a MORNING allocation paper exists even when it has zero requirements',
            async () => {
                const { vehicle, distributor, product } =
                    await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                const morningAllocationPaper =
                    await prisma.vehicle_allocation_paper.create({
                        data: {
                            order_paper_id: orderPaper.id,
                            delivery_session: DeliverySession.MORNING,
                        },
                    });

                try {
                    const { service } = createService();

                    const result = await service.getPurchases(orderPaper.id);

                    /*
                     * The existence of the MORNING allocation paper means
                     * allocation is no longer pending, even though there are
                     * currently zero MORNING allocation rows.
                     */
                    expect(result.morningAllocationPending).toBe(false);

                    const morningAllocations =
                        await prisma.vehicle_allocation.findMany({
                            where: {
                                vehicle_allocation_paper_id:
                                    morningAllocationPaper.id,
                            },
                        });

                    expect(morningAllocations).toHaveLength(0);
                } finally {
                    await prisma.vehicle_allocation_paper.delete({
                        where: {
                            id: morningAllocationPaper.id,
                        },
                    });

                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            id: allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );
    });

    describe('getPurchases - orphanedEntries', () => {
        it(
            'surfaces a saved purchase row missing from the current allocation grid without duplicating it in purchases.rows',
            async () => {
                const { vehicle, distributor, product, productLink } =
                    await getSeedData();

                const secondVehicle =
                    await prisma.master_vehicle.findFirst({
                        where: {
                            id: {
                                not: vehicle.id,
                            },
                        },
                    });

                expect(secondVehicle).not.toBeNull();

                const orderPaper = await createOrderPaper();

                const orderItem = await createOrderItemFixture({
                    orderPaperId: orderPaper.id,
                    productId: product.id,
                    productLinkId: productLink.id,
                });

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                const purchasePaper = await createPurchasePaper(
                    orderPaper.id,
                );

                const purchaseEntry = await createPurchaseEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: secondVehicle!.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    productLinkId: productLink.id,
                    gatepassDate: new Date(),
                    purchasedQty: '7.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '175.00',
                    sourceAllocationId: allocation.id,
                    sourceAllocatedQty: '10.00',
                });

                try {
                    const { service } = createService();

                    const result = await service.getPurchases(
                        orderPaper.id,
                    );

                    expect(result.orphanedEntries).toHaveLength(1);

                    expect(result.orphanedEntries[0]).toMatchObject({
                        purchasedQty: 7,
                        vehicleId: secondVehicle!.id,
                        distributorId: distributor.id,
                        category: SupplyCategory.MILK,
                        productId: product.id,
                        deliverySession: DeliverySession.NIGHT,
                    });

                    const purchaseRows = result.purchases.flatMap(
                        (purchase: any) => purchase.rows ?? [],
                    );

                    expect(
                        purchaseRows.some(
                            (row: any) => row.id === purchaseEntry.id,
                        ),
                    ).toBe(false);
                } finally {
                    await prisma.purchase_entry.deleteMany({
                        where: {
                            purchase_paper_id: purchasePaper.id,
                        },
                    });

                    await prisma.purchase_paper.delete({
                        where: {
                            id: purchasePaper.id,
                        },
                    });

                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );
    });

    describe('savePurchases - optimistic concurrency', () => {
        it(
            'rejects a stale expectedUpdatedAt without writing purchase entries',
            async () => {
                const { vehicle, distributor, product } =
                    await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                const purchasePaper = await createPurchasePaper(
                    orderPaper.id,
                );

                const currentUpdatedAt = purchasePaper.updated_at;

                try {
                    const { service } = createService();

                    const staleUpdatedAt = new Date(
                        currentUpdatedAt.getTime() - 60_000,
                    );

                    const dto = {
                        expectedUpdatedAt: staleUpdatedAt.toISOString(),
                        entries: [],
                        confirmDeletions: true,
                    };

                    await expect(
                        service.savePurchases(orderPaper.id, dto as any),
                    ).rejects.toMatchObject({
                        status: 409,
                    });

                    const entries =
                        await prisma.purchase_entry.findMany({
                            where: {
                                purchase_paper_id: purchasePaper.id,
                            },
                        });

                    expect(entries).toHaveLength(0);

                    const purchasePaperAfter =
                        await prisma.purchase_paper.findUnique({
                            where: {
                                id: purchasePaper.id,
                            },
                        });

                    expect(
                        purchasePaperAfter?.updated_at.getTime(),
                    ).toBe(currentUpdatedAt.getTime());
                } finally {
                    await prisma.purchase_entry.deleteMany({
                        where: {
                            purchase_paper_id: purchasePaper.id,
                        },
                    });

                    await prisma.purchase_paper.delete({
                        where: {
                            id: purchasePaper.id,
                        },
                    });

                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );
    });


    describe('savePurchases - quantity boundary', () => {
        it('accepts purchased quantity equal to allocated quantity', async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            try {
                const { service } = createService();

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 10,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                const result = await service.savePurchases(orderPaper.id, dto);

                expect(result).toEqual({ success: true });

                const savedEntry = await prisma.purchase_entry.findFirst({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                        vehicle_id: vehicle.id,
                        distributor_id: distributor.id,
                        product_id: product.id,
                        category: SupplyCategory.MILK,
                        delivery_session: DeliverySession.NIGHT,
                    },
                });

                expect(savedEntry).not.toBeNull();
                expect(Number(savedEntry!.purchased_qty)).toBe(10);
                expect(Number(savedEntry!.source_allocated_qty)).toBe(10);
                expect(savedEntry!.source_allocation_id).toBe(allocation.id);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });
                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });
                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });
                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });
                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocation.vehicle_allocation_paper_id },
                });
                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });
                vi.restoreAllMocks();
            }
        });

        it('rejects purchased quantity greater than allocated quantity', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            try {
                const { service } = createService();

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 10.01,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                const beforeCount = await prisma.purchase_entry.count({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await expect(
                    service.savePurchases(orderPaper.id, dto),
                ).rejects.toThrow();

                const afterCount = await prisma.purchase_entry.count({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                expect(afterCount).toBe(beforeCount);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });
                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });
                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });
                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });
                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocation.vehicle_allocation_paper_id },
                });
                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });
                vi.restoreAllMocks();
            }
        });
    });



    describe('savePurchases - deletion confirmation', () => {
        it(
            'rejects deletion of existing purchase entries when confirmDeletions is false',
            async () => {
                const { vehicle, distributor, product, productLink } =
                    await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                const purchasePaper = await createPurchasePaper(
                    orderPaper.id,
                );

                const purchaseEntry = await createPurchaseEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    productLinkId: productLink.id,
                    gatepassDate: new Date(),
                    purchasedQty: '7.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '175.00',
                    sourceAllocationId: allocation.id,
                    sourceAllocatedQty: '10.00',
                });

                try {
                    const { service } = createService();

                    await expect(
                        service.savePurchases(
                            orderPaper.id,
                            {
                                entries: [],
                                confirmDeletions: false,
                            } as any,
                        ),
                    ).rejects.toMatchObject({
                        status: 400,
                    });

                    const entryAfter =
                        await prisma.purchase_entry.findUnique({
                            where: {
                                id: purchaseEntry.id,
                            },
                        });

                    expect(entryAfter).not.toBeNull();
                    expect(Number(entryAfter!.purchased_qty)).toBe(7);
                } finally {
                    await prisma.purchase_entry.deleteMany({
                        where: {
                            purchase_paper_id: purchasePaper.id,
                        },
                    });

                    await prisma.purchase_paper.delete({
                        where: {
                            id: purchasePaper.id,
                        },
                    });

                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );

        it(
            'deletes existing purchase entries when confirmDeletions is true',
            async () => {
                const { vehicle, distributor, product, productLink } =
                    await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                const purchasePaper = await createPurchasePaper(
                    orderPaper.id,
                );

                const purchaseEntry = await createPurchaseEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    productLinkId: productLink.id,
                    gatepassDate: new Date(),
                    purchasedQty: '7.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '175.00',
                    sourceAllocationId: allocation.id,
                    sourceAllocatedQty: '10.00',
                });

                try {
                    const { service } = createService();

                    await service.savePurchases(
                        orderPaper.id,
                        {
                            entries: [],
                            confirmDeletions: true,
                        } as any,
                    );

                    const entryAfter =
                        await prisma.purchase_entry.findUnique({
                            where: {
                                id: purchaseEntry.id,
                            },
                        });

                    expect(entryAfter).toBeNull();
                } finally {
                    await prisma.purchase_entry.deleteMany({
                        where: {
                            purchase_paper_id: purchasePaper.id,
                        },
                    });

                    await prisma.purchase_paper.delete({
                        where: {
                            id: purchasePaper.id,
                        },
                    });

                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );
    });

    describe('savePurchases - tray type behavior', () => {
        it(
            'preserves the existing purchase entry tray_type_id when saving again',
            async () => {
                const { vehicle, distributor, product, productLink } =
                    await getSeedData();

                const orderPaper = await createOrderPaper();

                const allocation = await createAllocationFixture({
                    orderPaperId: orderPaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    allocatedQty: '10.00',
                });

                const purchasePaper = await createPurchasePaper(
                    orderPaper.id,
                );

                const trayType = await prisma.master_tray_type.findFirst();

                expect(trayType).not.toBeNull();

                const frozenTrayTypeId = trayType!.id;

                const purchaseEntry = await createPurchaseEntry({
                    purchasePaperId: purchasePaper.id,
                    vehicleId: vehicle.id,
                    distributorId: distributor.id,
                    productId: product.id,
                    productLinkId: productLink.id,
                    gatepassDate: new Date(),
                    purchasedQty: '7.00',
                    purchaseRate: '25.00',
                    purchaseAmount: '175.00',
                    sourceAllocationId: allocation.id,
                    sourceAllocatedQty: '10.00',
                });

                await prisma.purchase_entry.update({
                    where: {
                        id: purchaseEntry.id,
                    },
                    data: {
                        tray_type_id: frozenTrayTypeId,
                    },
                });

                try {
                    const { service, trayCalculationService } =
                        createService();

                    vi.spyOn(
                        trayCalculationService,
                        'resolveFrozenTrayTypeId',
                    ).mockReturnValue(frozenTrayTypeId);

                    await service.savePurchases(
                        orderPaper.id,
                        {
                            entries: [
                                {
                                    vehicleId: vehicle.id,
                                    distributorId: distributor.id,
                                    category: SupplyCategory.MILK,
                                    productId: product.id,
                                    deliverySession: DeliverySession.NIGHT,
                                    purchasedQty: 8,
                                },
                            ],
                            confirmDeletions: false,
                        } as any,
                    );

                    const savedEntry =
                        await prisma.purchase_entry.findUnique({
                            where: {
                                id: purchaseEntry.id,
                            },
                        });

                    expect(savedEntry).not.toBeNull();
                    expect(savedEntry!.tray_type_id).toBe(
                        frozenTrayTypeId,
                    );
                    expect(Number(savedEntry!.purchased_qty)).toBe(8);
                } finally {
                    await prisma.purchase_entry.deleteMany({
                        where: {
                            purchase_paper_id: purchasePaper.id,
                        },
                    });

                    await prisma.purchase_paper.delete({
                        where: {
                            id: purchasePaper.id,
                        },
                    });

                    await prisma.vehicle_distribution_assignment.deleteMany({
                        where: {
                            vehicle_allocation_paper_id:
                                allocation.vehicle_allocation_paper_id,
                        },
                    });

                    await prisma.vehicle_allocation.deleteMany({
                        where: {
                            id: allocation.id,
                        },
                    });

                    await prisma.vehicle_allocation_paper.deleteMany({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                    await prisma.order_paper.delete({
                        where: {
                            id: orderPaper.id,
                        },
                    });
                }
            },
        );
    });

    describe('savePurchases - assignment matching', () => {
        it('rejects when the vehicle is assigned to a different distributor', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const otherDistributor = await prisma.master_distributor.findFirst({
                where: {
                    id: {
                        not: distributor.id,
                    },
                },
            });

            expect(otherDistributor).not.toBeNull();

            const orderPaper = await createOrderPaper();

            const allocationPaper = await prisma.vehicle_allocation_paper.create({
                data: {
                    order_paper_id: orderPaper.id,
                    delivery_session: DeliverySession.NIGHT,
                },
            });

            const allocation = await prisma.vehicle_allocation.create({
                data: {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle.id,
                    distributor_id: otherDistributor!.id,
                    product_id: product.id,
                    allocated_qty: '10.00',
                    category: SupplyCategory.MILK,
                },
            });

            // Assignment deliberately belongs to the ORIGINAL distributor.
            await prisma.vehicle_distribution_assignment.create({
                data: {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle.id,
                    distributor_id: distributor.id,
                    category: SupplyCategory.MILK,
                },
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            try {
                const { service } = createService();

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: otherDistributor!.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 5,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                await expect(
                    service.savePurchases(orderPaper.id, dto),
                ).rejects.toThrow(
                    PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(
                        vehicle.id,
                    ),
                );

                const savedEntries = await prisma.purchase_entry.findMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                expect(savedEntries).toHaveLength(0);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });

                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id: allocationPaper.id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocationPaper.id },
                });

                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });

                vi.restoreAllMocks();
            }
        });

        it('rejects when no vehicle assignment exists', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            try {
                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                const { service } = createService();

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 5,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                await expect(
                    service.savePurchases(orderPaper.id, dto),
                ).rejects.toThrow(
                    PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(
                        vehicle.id,
                    ),
                );

                const savedEntries = await prisma.purchase_entry.findMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                expect(savedEntries).toHaveLength(0);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });
                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });
                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });
                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });
                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocation.vehicle_allocation_paper_id },
                });
                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });
                vi.restoreAllMocks();
            }
        });
    });


    describe('savePurchases - gatepass date policy', () => {
        it('uses the previous calendar day for PREVIOUS_DAY policy', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const originalPolicy =
                product.master_brand.gatepass_date_policy;

            try {
                await prisma.master_brand.update({
                    where: {
                        id: product.master_brand.id,
                    },
                    data: {
                        gatepass_date_policy: GatepassDatePolicy.PREVIOUS_DAY,
                    },
                });

                const { service, purchaseCommercialService } = createService();

                purchaseCommercialService.resolveGatepassDateFor.mockImplementation(
                    (date: Date, policy: GatepassDatePolicy) => {
                        const result = new Date(date);

                        if (policy === GatepassDatePolicy.PREVIOUS_DAY) {
                            result.setUTCDate(result.getUTCDate() - 1);
                        }

                        return result;
                    },
                );

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 5,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                await service.savePurchases(orderPaper.id, dto);

                const savedEntry = await prisma.purchase_entry.findFirst({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                expect(savedEntry).not.toBeNull();

                const expectedDate = new Date(orderPaper.sale_date);
                expectedDate.setUTCDate(expectedDate.getUTCDate() - 1);

                expect(savedEntry!.gatepass_date.getTime()).toBe(
                    expectedDate.getTime(),
                );
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });

                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocation.vehicle_allocation_paper_id },
                });

                await prisma.master_brand.update({
                    where: {
                        id: product.master_brand.id,
                    },
                    data: {
                        gatepass_date_policy: originalPolicy,
                    },
                });

                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });

                vi.restoreAllMocks();
            }
        });

        it('uses the same calendar day for SAME_DAY policy', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const originalPolicy =
                product.master_brand.gatepass_date_policy;

            try {
                await prisma.master_brand.update({
                    where: {
                        id: product.master_brand.id,
                    },
                    data: {
                        gatepass_date_policy: GatepassDatePolicy.SAME_DAY,
                    },
                });

                const { service, purchaseCommercialService } = createService();

                purchaseCommercialService.resolveGatepassDateFor.mockImplementation(
                    (date: Date, policy: GatepassDatePolicy) => {
                        const result = new Date(date);

                        if (policy === GatepassDatePolicy.PREVIOUS_DAY) {
                            result.setUTCDate(result.getUTCDate() - 1);
                        }

                        return result;
                    },
                );

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 5,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                await service.savePurchases(orderPaper.id, dto);

                const savedEntry = await prisma.purchase_entry.findFirst({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                expect(savedEntry).not.toBeNull();

                expect(savedEntry!.gatepass_date.getTime()).toBe(
                    orderPaper.sale_date.getTime(),
                );
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });

                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocation.vehicle_allocation_paper_id },
                });

                await prisma.master_brand.update({
                    where: {
                        id: product.master_brand.id,
                    },
                    data: {
                        gatepass_date_policy: originalPolicy,
                    },
                });

                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });

                vi.restoreAllMocks();
            }
        });
    });

    describe('savePurchases - new entry tray type', () => {
        it('uses the current tray rule for a new purchase entry', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const trayType = await prisma.master_tray_type.findFirst();

            expect(trayType).not.toBeNull();

            const newTrayTypeId = trayType!.id;

            try {
                const { service, trayCalculationService } = createService();

                trayCalculationService.resolveTrayRule.mockReturnValue({
                    tray_type_id: newTrayTypeId,
                });

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 5,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                await service.savePurchases(orderPaper.id, dto);

                const savedEntry = await prisma.purchase_entry.findFirst({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                        vehicle_id: vehicle.id,
                        distributor_id: distributor.id,
                        product_id: product.id,
                        category: SupplyCategory.MILK,
                        delivery_session: DeliverySession.NIGHT,
                    },
                });

                expect(savedEntry).not.toBeNull();

                expect(savedEntry!.tray_type_id).toBe(newTrayTypeId);

                expect(
                    trayCalculationService.resolveTrayRule,
                ).toHaveBeenCalled();

                expect(
                    trayCalculationService.resolveFrozenTrayTypeId,
                ).not.toHaveBeenCalled();
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: { purchase_paper_id: purchasePaper.id },
                });

                await prisma.purchase_paper.delete({
                    where: { id: purchasePaper.id },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: { id: allocation.id },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: { id: allocation.vehicle_allocation_paper_id },
                });

                await prisma.order_paper.delete({
                    where: { id: orderPaper.id },
                });

                vi.restoreAllMocks();
            }
        });
    });

    describe('savePurchases - Dairy Trays propagation', () => {
        it('recalculates the current Dairy Trays paper after saving purchases', async () => {
            const { vehicle, distributor, product } = await getSeedData();

            const trayType = await prisma.master_tray_type.findFirst({
                where: {
                    is_active: true,
                },
            });

            expect(trayType).not.toBeNull();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            try {
                const { service, trayCalculationService } = createService();

                // The purchase entry must resolve to a real tray type because
                // DairyTraysPropagationService persists the tray_type_id as an FK.
                trayCalculationService.resolveTrayRule.mockReturnValue({
                    tray_type_id: trayType!.id,
                });

                trayCalculationService.resolveFrozenTrayTypeId.mockImplementation(
                    (entry) => entry.tray_type_id ?? trayType!.id,
                );

                const dairyTraysRepository = new DairyTraysRepository(
                    prisma as any,
                );

                const dairyTraysPropagationService =
                    new DairyTraysPropagationService(
                        dairyTraysRepository,
                        trayCalculationService as any,
                    );

                const dependencyOrchestrator =
                    new DependencyOrchestratorService(
                        {} as any,
                        dairyTraysPropagationService,
                        {} as any,
                    );

                // Replace the mocked orchestrator with the real one.
                (service as any).dependencyOrchestrator =
                    dependencyOrchestrator;

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 5,
                        },
                    ],
                    confirmDeletions: false,
                } as any;

                await service.savePurchases(orderPaper.id, dto);

                const dairyTrayPaper =
                    await prisma.dairy_tray_paper.findUnique({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                expect(dairyTrayPaper).not.toBeNull();

                const transaction =
                    await prisma.dairy_tray_transaction.findFirst({
                        where: {
                            dairy_tray_paper_id: dairyTrayPaper!.id,
                            vehicle_id: vehicle.id,
                            tray_type_id: trayType!.id,
                            delivery_session: DeliverySession.NIGHT,
                        },
                    });

                expect(transaction).not.toBeNull();

                expect(Number(transaction!.trays_taken)).toBe(5);
                expect(Number(transaction!.trays_returned)).toBe(0);
                expect(Number(transaction!.closing_balance)).toBe(5);
            } finally {
                const dairyTrayPaper =
                    await prisma.dairy_tray_paper.findUnique({
                        where: {
                            order_paper_id: orderPaper.id,
                        },
                    });

                if (dairyTrayPaper) {
                    await prisma.dairy_tray_transaction.deleteMany({
                        where: {
                            dairy_tray_paper_id: dairyTrayPaper.id,
                        },
                    });

                    await prisma.dairy_tray_paper.delete({
                        where: {
                            id: dairyTrayPaper.id,
                        },
                    });
                }

                await prisma.purchase_entry.deleteMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await prisma.purchase_paper.delete({
                    where: {
                        id: purchasePaper.id,
                    },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: {
                        id: allocation.id,
                    },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: {
                        id: orderPaper.id,
                    },
                });

                vi.restoreAllMocks();
            }
        });
    });

    describe('savePurchases - transaction rollback', () => {
        it('rolls back purchase changes when downstream propagation fails', async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            const existingEntry = await createPurchaseEntry({
                purchasePaperId: purchasePaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                productLinkId: productLink.id,
                gatepassDate: orderPaper.sale_date,
                purchasedQty: '5.00',
                purchaseRate: '25.00',
                purchaseAmount: '125.00',
                sourceAllocationId: allocation.id,
                sourceAllocatedQty: '10.00',
            });

            try {
                const { service } = createService();

                const dependencyOrchestrator =
                    (service as any).dependencyOrchestrator;

                dependencyOrchestrator.execute.mockRejectedValueOnce(
                    new Error('forced downstream failure'),
                );

                const dto = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 9,
                        },
                    ],
                    confirmDeletions: false,
                };

                await expect(
                    service.savePurchases(orderPaper.id, dto as any),
                ).rejects.toThrow('forced downstream failure');

                const after = await prisma.purchase_entry.findMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                /*
                 * The save attempted to change 5 -> 9.
                 * Because propagation failed inside the same transaction,
                 * the original row must be restored.
                 */
                expect(after).toHaveLength(1);
                expect(after[0].id).toBe(existingEntry.id);
                expect(Number(after[0].purchased_qty)).toBe(5);
                expect(Number(after[0].purchase_rate)).toBe(25);
                expect(Number(after[0].purchase_amount)).toBe(125);
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await prisma.purchase_paper.delete({
                    where: {
                        id: purchasePaper.id,
                    },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: {
                        id: allocation.id,
                    },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: {
                        id: orderPaper.id,
                    },
                });
            }
        });
    });

    describe('savePurchases - concurrent saves', () => {
        it('keeps the purchase state consistent when two saves run concurrently', async () => {
            const { vehicle, distributor, product, productLink } =
                await getSeedData();

            const orderPaper = await createOrderPaper();

            const allocation = await createAllocationFixture({
                orderPaperId: orderPaper.id,
                vehicleId: vehicle.id,
                distributorId: distributor.id,
                productId: product.id,
                allocatedQty: '10.00',
            });

            const purchasePaper = await createPurchasePaper(orderPaper.id);

            try {
                const first = createService();
                const second = createService();

                const dto1 = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 4,
                        },
                    ],
                    confirmDeletions: true,
                };

                const dto2 = {
                    entries: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributor.id,
                            category: SupplyCategory.MILK,
                            productId: product.id,
                            deliverySession: DeliverySession.NIGHT,
                            purchasedQty: 7,
                        },
                    ],
                    confirmDeletions: true,
                };

                /*
                 * Start both transactions before awaiting either one.
                 *
                 * The two requests target the same logical purchase-entry key,
                 * so this exercises the real transaction/concurrency behavior.
                 */
                const results = await Promise.allSettled([
                    first.service.savePurchases(orderPaper.id, dto1 as any),
                    second.service.savePurchases(orderPaper.id, dto2 as any),
                ]);

                const fulfilled = results.filter(
                    (result) => result.status === 'fulfilled',
                );

                const rejected = results.filter(
                    (result) => result.status === 'rejected',
                );

                /*
                 * At least one save must succeed.
                 *
                 * A serialization conflict may cause one transaction to retry
                 * and eventually succeed, or one transaction may fail after
                 * exhausting the retry policy. What matters is that the final
                 * database state is valid.
                 */
                expect(fulfilled.length).toBeGreaterThanOrEqual(1);

                /*
                 * There must be at most one purchase entry for the logical key.
                 */
                const entries = await prisma.purchase_entry.findMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                        vehicle_id: vehicle.id,
                        distributor_id: distributor.id,
                        category: SupplyCategory.MILK,
                        product_id: product.id,
                        delivery_session: DeliverySession.NIGHT,
                    },
                });

                expect(entries).toHaveLength(1);

                /*
                 * The final quantity must correspond to one complete transaction,
                 * never a partial/interleaved result.
                 */
                expect([4, 7]).toContain(
                    Number(entries[0].purchased_qty),
                );

                /*
                 * If a transaction failed, it must not have left behind a
                 * second/partial row.
                 */
                if (rejected.length > 0) {
                    expect(entries).toHaveLength(1);
                }
            } finally {
                await prisma.purchase_entry.deleteMany({
                    where: {
                        purchase_paper_id: purchasePaper.id,
                    },
                });

                await prisma.purchase_paper.delete({
                    where: {
                        id: purchasePaper.id,
                    },
                });

                await prisma.vehicle_distribution_assignment.deleteMany({
                    where: {
                        vehicle_allocation_paper_id:
                            allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.vehicle_allocation.delete({
                    where: {
                        id: allocation.id,
                    },
                });

                await prisma.vehicle_allocation_paper.delete({
                    where: {
                        id: allocation.vehicle_allocation_paper_id,
                    },
                });

                await prisma.order_paper.delete({
                    where: {
                        id: orderPaper.id,
                    },
                });
            }
        });
    });
});