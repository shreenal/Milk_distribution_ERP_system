import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from '../../../app.module.js';
import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaperRepository } from '../paper/paper.repository.js';
import { DeliverySession } from '../../../generated/prisma/client.js';

import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

/**
 * Fills the gap identified in the Vehicle Allocation test audit: the plan's
 * §15 cross-module matrix row
 *
 *   "Orders save (product link resolution) → Vehicle Allocation demand
 *    summary reflects the resolved distributor"   [§7.6]
 *
 * had no corresponding VA-side test. OrderItemsRepository.
 * getOrderItemsWithSupplyContextByPaperId carries an explicit comment that
 * the distributor read back for each item must be the one actually
 * resolved and pinned by OrderCommercialService (via product_link_id) —
 * "never recompute it downstream, always read it back from
 * product_link_id" — because the group's nominal supply-rule distributor
 * can be overridden by procurement eligibility/priority fallback. This
 * test proves that invariant holds all the way through to the Vehicle
 * Allocation demand/requirement grid that VehicleAllocationService builds
 * from AllocationSummaryBuilder.
 *
 * Uses the seeded Group 10 / SHA-TONED-500 fallback fixture: Group 10's
 * primary MILK distributor (master_group_supply_rule) is Distributor B,
 * but B has no master_product_link for any Shakti product, so
 * OrderCommercialService.resolve falls back to Distributor A (the seeded
 * priority-1 alternate for Group 10 — see test-seed.ts §13A). This is the
 * same fixture orders.service.propagation.spec.ts uses to prove the
 * Orders-side pin; this test extends that one step further downstream
 * into Vehicle Allocation, which orders.service.propagation.spec.ts does
 * not and should not cover (out of that file's module boundary).
 */
describe('VehicleAllocationService cross-module: Orders fallback resolution reflected in demand summary (plan §15)', () => {
  let app: INestApplication;
  let vehicleAllocationService: VehicleAllocationService;
  let ordersService: OrdersService;
  let paperRepository: PaperRepository;

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    await resetPaperData();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    vehicleAllocationService = app.get(VehicleAllocationService);
    ordersService = app.get(OrdersService);
    paperRepository = new PaperRepository(testPrisma);
  });

  afterEach(async () => {
    await app.close();
    await resetPaperData();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  it("groups fallback-resolved demand under the actually-resolved distributor, not the group's nominal primary distributor", async () => {
    const group10 = await testPrisma.master_group.findFirstOrThrow({
      where: { name: 'Group 10' },
    });

    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-07-01T00:00:00.000Z'),
    );

    await paperRepository.generateOrderSheets(paper.id, [group10]);

    const sheet = await testPrisma.order_sheet.findFirstOrThrow({
      where: { order_paper_id: paper.id, group_id: group10.id },
    });

    const client = await testPrisma.master_client.findFirstOrThrow({
      where: { delivery_group_id: group10.id, is_active: true },
      orderBy: { id: 'asc' },
    });

    const shaTonedProduct = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'SHA-TONED-500' },
    });

    const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor A' },
    });

    const distributorB = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor B' },
    });

    await ordersService.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: shaTonedProduct.id,
        orderedQty: 10,
      },
    ]);

    // Sanity check on the Orders-side precondition this test depends on
    // (already proven independently by orders.service.propagation.spec.ts;
    // re-asserted here as a guard against fixture drift, not re-tested
    // as new coverage).
    const pin = await testPrisma.order_sheet_product.findUniqueOrThrow({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheet.id,
          product_id: shaTonedProduct.id,
        },
      },
    });
    expect(pin.resolved_via_fallback).toBe(true);

    // Group 10 is seeded with delivery_session = MORNING (groups 1-9
    // are NIGHT — see test-seed.ts §17), and AllocationSummaryBuilder
    // filters strictly by the requested session, so the query session
    // must match the group's actual session or the grid comes back
    // empty regardless of resolution correctness.
    const result = await vehicleAllocationService.getVehicleAllocations(
      paper.id,
      DeliverySession.MORNING,
    );

    const field = `product_${shaTonedProduct.id}`;

    const distributorAGrid = result.requirementGrids.find(
      (grid) => grid.distributor.id === distributorA.id,
    );
    const distributorBGrid = result.requirementGrids.find(
      (grid) => grid.distributor.id === distributorB.id,
    );

    // The resolved distributor (A) must carry the demand.
    expect(distributorAGrid).toBeDefined();
    expect(distributorAGrid?.totals[field]).toBe(10);

    // The group's nominal primary (B) must NOT carry this demand —
    // either it has no grid at all for this session/category, or its
    // grid has no entry (or a zero entry) for this product field.
    expect(distributorBGrid?.totals[field] ?? 0).toBe(0);
  });

  it('does not resolve non-fallback demand under the fallback distributor', async () => {
    // Companion negative case using the group's normal (non-fallback)
    // path: Group 1-9's Govind milk products resolve to Distributor A
    // directly (no fallback needed), so this demand must appear only
    // under A and never under B, the priority-1 alternate for those
    // groups. This guards against a test-fixture false positive where
    // "appears under A" would trivially pass regardless of whether
    // fallback resolution actually ran.
    const group1 = await testPrisma.master_group.findFirstOrThrow({
      where: { name: 'Group 1' },
    });

    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-07-02T00:00:00.000Z'),
    );

    await paperRepository.generateOrderSheets(paper.id, [group1]);

    const sheet = await testPrisma.order_sheet.findFirstOrThrow({
      where: { order_paper_id: paper.id, group_id: group1.id },
    });

    const client = await testPrisma.master_client.findFirstOrThrow({
      where: { delivery_group_id: group1.id, is_active: true },
      orderBy: { id: 'asc' },
    });

    const govCow500 = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'GOV-COW-500' },
    });

    const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor A' },
    });
    const distributorB = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor B' },
    });

    await ordersService.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: govCow500.id,
        orderedQty: 15,
      },
    ]);

    const pin = await testPrisma.order_sheet_product.findUniqueOrThrow({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheet.id,
          product_id: govCow500.id,
        },
      },
    });
    expect(pin.resolved_via_fallback).toBe(false);

    const result = await vehicleAllocationService.getVehicleAllocations(
      paper.id,
      DeliverySession.NIGHT,
    );

    const field = `product_${govCow500.id}`;

    const distributorAGrid = result.requirementGrids.find(
      (grid) => grid.distributor.id === distributorA.id,
    );
    const distributorBGrid = result.requirementGrids.find(
      (grid) => grid.distributor.id === distributorB.id,
    );

    expect(distributorAGrid?.totals[field]).toBe(15);
    expect(distributorBGrid?.totals[field] ?? 0).toBe(0);
  });
});
