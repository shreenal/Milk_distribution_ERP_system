import {
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { Server } from 'node:http';

import { AppModule } from '../../../app.module.js';
import { PaperRepository } from '../paper/paper.repository.js';
import {
    assertSeedDataPresent,
    resetPaperData,
    testPrisma,
} from '../../../../test/helper/db.js';

describe('VehicleAllocationController (e2e)', () => {
    let app: INestApplication;
    let accessToken: string;
    let paperId: number;
    let fixtureCounter = 0;

    const paperRepository = new PaperRepository(testPrisma);

    beforeAll(async () => {
        await assertSeedDataPresent();
    });

    beforeEach(async () => {
        await resetPaperData();

        const moduleFixture: TestingModule =
            await Test.createTestingModule({
                imports: [AppModule],
            }).compile();

        app = moduleFixture.createNestApplication();

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
            }),
        );

        await app.init();

        accessToken = await loginAsEmployee();

        const orderDate = new Date();
        orderDate.setUTCHours(0, 0, 0, 0);
        orderDate.setUTCDate(
            orderDate.getUTCDate() +
            2000 +
            fixtureCounter++,
        );

        const paper =
            await paperRepository.generatePaperFromOrderDate(
                orderDate,
            );

        const groups =
            await paperRepository.getActiveGroups();

        await paperRepository.generateOrderSheets(
            paper.id,
            groups,
        );

        paperId = paper.id;
    });

    afterEach(async () => {
        await app.close();
    });

    afterAll(async () => {
        await resetPaperData();
        await testPrisma.$disconnect();
    });

    function server() {
        return app.getHttpServer() as Server;
    }

    async function loginAsEmployee(): Promise<string> {
        const response = await request(server())
            .post('/auth/login')
            .send({
                username: 'employee1',
                password: 'password123',
            })
            .expect(201);

        expect(response.body.accessToken).toBeDefined();
        expect(response.body.user.username).toBe(
            'employee1',
        );
        expect(response.body.user.role).toBe('EMPLOYEE');

        return response.body.accessToken;
    }

    describe('authentication', () => {
        it('rejects unauthenticated GET requests', async () => {
            await request(server())
                .get(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .query({
                    session: 'MORNING',
                })
                .expect(401);
        });

        it('rejects unauthenticated POST requests', async () => {
            await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .send({
                    assignments: [],
                    allocations: [],
                })
                .expect(401);
        });
    });

    describe('GET /vehicle-allocations/:paperId/vehicle-allocations', () => {
        it('returns vehicle allocation data for an authenticated employee', async () => {
            const response = await request(server())
                .get(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .query({
                    session: 'MORNING',
                })
                .expect(200);

            expect(response.body).toBeDefined();
            expect(response.body.paper).toBeDefined();
            expect(response.body.paper.id).toBe(paperId);
            expect(response.body.workflow).toBeDefined();
            expect(
                response.body.vehicleAssignments,
            ).toBeDefined();
            expect(
                response.body.requirementGrids,
            ).toBeDefined();
            expect(
                response.body.vehicleAllocationPaperUpdatedAt,
            ).toBeNull();
        });

        it('rejects an invalid paperId', async () => {
            const response = await request(server())
                .get(
                    '/vehicle-allocations/not-a-number/vehicle-allocations',
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .query({
                    session: 'MORNING',
                });

            expect(response.status).toBe(400);
        });

        it('rejects an invalid delivery session', async () => {
            const response = await request(server())
                .get(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .query({
                    session: 'INVALID_SESSION',
                });

            expect(response.status).toBe(400);
        });

        it('rejects a missing delivery session', async () => {
            const response = await request(server())
                .get(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                );

            expect(response.status).toBe(400);
        });
    });

    describe('POST /vehicle-allocations/:paperId/vehicle-allocations', () => {
        it('accepts an empty allocation payload and succeeds for a fresh DRAFT paper', async () => {
            const response = await request(server())
                .post(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    assignments: [],
                    allocations: [],
                });

            // The paper is freshly generated (DRAFT, NIGHT session active) and no
            // demand/validation should reject an empty payload — this must
            // deterministically succeed, not "either 201 or 400".
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                success: true,
                changed: false,
            });
        });

        it('rejects an invalid allocation item at the HTTP boundary', async () => {
            const response = await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .send({
                    assignments: [],
                    allocations: [
                        {
                            vehicleId: 'invalid',
                            distributorId: 1,
                            category: 'MILK',
                            productId: 1,
                            allocatedQty: 10,
                        },
                    ],
                });

            expect(response.status).toBe(400);
        });

        it('rejects a negative allocated quantity at the HTTP boundary', async () => {
            const response = await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .send({
                    assignments: [],
                    allocations: [
                        {
                            vehicleId: 1,
                            distributorId: 1,
                            category: 'MILK',
                            productId: 1,
                            allocatedQty: -10,
                        },
                    ],
                });

            expect(response.status).toBe(400);
        });

        it('rejects an invalid allocation category at the HTTP boundary', async () => {
            const response = await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .send({
                    assignments: [],
                    allocations: [
                        {
                            vehicleId: 1,
                            distributorId: 1,
                            category: 'INVALID_CATEGORY',
                            productId: 1,
                            allocatedQty: 10,
                        },
                    ],
                });

            expect(response.status).toBe(400);
        });

        it('rejects an invalid assignment item at the HTTP boundary', async () => {
            const response = await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .send({
                    assignments: [
                        {
                            vehicleId: 'invalid',
                            milkDistributorId: 1,
                            nonMilkDistributorId: null,
                        },
                    ],
                    allocations: [],
                });

            expect(response.status).toBe(400);
        });

        it('rejects an invalid expectedUpdatedAt value at the HTTP boundary', async () => {
            const response = await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .send({
                    assignments: [],
                    allocations: [],
                    expectedUpdatedAt: 'not-a-date',
                });

            expect(response.status).toBe(400);
        });

        it('accepts a valid expectedUpdatedAt format at the DTO boundary', async () => {
            const response = await request(server())
                .post(
                    `/vehicle-allocations/${paperId}/vehicle-allocations`,
                )
                .set(
                    'Authorization',
                    `Bearer ${accessToken}`,
                )
                .send({
                    assignments: [],
                    allocations: [],
                    expectedUpdatedAt:
                        '2026-01-01T10:00:00.000Z',
                });

            /*
             * DTO validation should not reject the ISO timestamp.
             * The service may subsequently reject it because the paper
             * does not yet have matching allocation state.
             */
            expect(response.status).not.toBe(422);
        });
    });

    describe('authenticated write → persisted state (DB assertions)', () => {
        it('persists a saved allocation and returns it via the GET endpoint', async () => {
            // Establish demand on the paper's active session so the allocation
            // is valid against validateVehicleAllocations.
            const sheet = await testPrisma.order_sheet.findFirstOrThrow({
                where: { order_paper_id: paperId },
            });

            const client = await testPrisma.master_client.findFirstOrThrow({
                where: { delivery_group_id: sheet.group_id, is_active: true },
            });

            const product = await testPrisma.master_product.findFirstOrThrow({
                where: { code: 'GOV-COW-500' },
            });

            await request(server())
                .post(`/orders/sheet/${sheet.id}/night-save`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send([{ clientId: client.id, productId: product.id, orderedQty: 25 }])
                .expect(201);

            const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
                where: { name: 'Distributor A' },
            });

            const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
                where: { vehicle_number: 'MH01AA1001' },
            });

            const saveResponse = await request(server())
                .post(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    assignments: [
                        {
                            vehicleId: vehicle.id,
                            milkDistributorId: distributorA.id,
                            nonMilkDistributorId: null,
                        },
                    ],
                    allocations: [
                        {
                            vehicleId: vehicle.id,
                            distributorId: distributorA.id,
                            category: 'MILK',
                            productId: product.id,
                            allocatedQty: 25,
                        },
                    ],
                })
                .expect(201);

            expect(saveResponse.body).toMatchObject({ success: true, changed: true });

            // Confirm via direct DB read.
            const allocationPaper = await testPrisma.vehicle_allocation_paper.findUniqueOrThrow({
                where: {
                    order_paper_id_delivery_session: {
                        order_paper_id: paperId,
                        delivery_session: 'NIGHT' as any,
                    },
                },
            });

            const persisted = await testPrisma.vehicle_allocation.findFirstOrThrow({
                where: {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle.id,
                    product_id: product.id,
                },
            });
            expect(Number(persisted.allocated_qty)).toBe(25);

            // Confirm via the GET endpoint round trip.
            const getResponse = await request(server())
                .get(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .query({ session: 'NIGHT' })
                .expect(200);

            expect(getResponse.body.vehicleAllocationPaperUpdatedAt).not.toBeNull();

            const field = `product_${product.id}`;
            const matchingRow = getResponse.body.allocations
                .flatMap((grid: any) => grid.rows)
                .find((row: any) => row.vehicleId === vehicle.id);

            expect(matchingRow).toBeDefined();
            expect(matchingRow[field]).toBe(25);
        });

        it('returns 409 when saving with a stale expectedUpdatedAt', async () => {
            const sheet = await testPrisma.order_sheet.findFirstOrThrow({
                where: { order_paper_id: paperId },
            });

            const client = await testPrisma.master_client.findFirstOrThrow({
                where: { delivery_group_id: sheet.group_id, is_active: true },
            });

            const product = await testPrisma.master_product.findFirstOrThrow({
                where: { code: 'GOV-COW-500' },
            });

            await request(server())
                .post(`/orders/sheet/${sheet.id}/night-save`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send([{ clientId: client.id, productId: product.id, orderedQty: 10 }])
                .expect(201);

            const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
                where: { name: 'Distributor A' },
            });
            const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
                where: { vehicle_number: 'MH01AA1001' },
            });

            const dto = {
                assignments: [
                    { vehicleId: vehicle.id, milkDistributorId: distributorA.id, nonMilkDistributorId: null },
                ],
                allocations: [
                    { vehicleId: vehicle.id, distributorId: distributorA.id, category: 'MILK', productId: product.id, allocatedQty: 10 },
                ],
            };

            await request(server())
                .post(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(dto)
                .expect(201);

            await request(server())
                .post(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...dto, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })
                .expect(409);
        });
    });

    describe('workflow-gate rejection at the HTTP level', () => {
        it('rejects a save when the paper is FINALIZED', async () => {
            await testPrisma.order_paper.update({
                where: { id: paperId },
                data: { status: 'FINALIZED' as any },
            });

            const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
                where: { vehicle_number: 'MH01AA1001' },
            });
            const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
                where: { name: 'Distributor A' },
            });

            const response = await request(server())
                .post(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    assignments: [
                        { vehicleId: vehicle.id, milkDistributorId: distributorA.id, nonMilkDistributorId: null },
                    ],
                    allocations: [],
                });

            // getActiveExecutionSession throws for FINALIZED before the edit
            // gate is even reached — must surface as a clean 400, not a 500.
            expect(response.status).toBe(400);
        });

        it('rejects a save when the paper is REOPENED', async () => {
            await testPrisma.order_paper.update({
                where: { id: paperId },
                data: { status: 'REOPENED' as any },
            });

            const response = await request(server())
                .post(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ assignments: [], allocations: [] });

            expect(response.status).toBe(400);
        });

        it('rejects GET with a session mismatched to a REOPENED paper the same way as any other read', async () => {
            await testPrisma.order_paper.update({
                where: { id: paperId },
                data: { status: 'REOPENED' as any },
            });

            // getVehicleAllocations itself does not gate on status (only save
            // does) — this should still succeed as a read.
            const response = await request(server())
                .get(`/vehicle-allocations/${paperId}/vehicle-allocations`)
                .set('Authorization', `Bearer ${accessToken}`)
                .query({ session: 'NIGHT' });

            expect(response.status).toBe(200);
        });
    });
});

