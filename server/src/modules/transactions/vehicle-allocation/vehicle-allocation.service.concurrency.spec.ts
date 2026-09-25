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
import { PaperRepository } from '../paper/paper.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import {
  SupplyCategory,
  DeliverySession,
} from '../../../generated/prisma/client.js';

import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

describe('VehicleAllocationService concurrency (integration, plan §13)', () => {
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

  it('exactly one of two concurrent saves with the same expectedUpdatedAt succeeds; the other receives 409', async () => {
    const orderDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const paper = await paperRepository.generatePaperFromOrderDate(orderDate);

    const groups = await paperRepository.getActiveGroups();
    await paperRepository.generateOrderSheets(paper.id, groups);

    // Establish demand so the allocation is valid against the summary,
    // and get an existing vehicle_allocation_paper row with a real
    // updated_at both concurrent calls will read.
    const sheet = await testPrisma.order_sheet.findFirstOrThrow({
      where: { order_paper_id: paper.id },
    });

    const client = await testPrisma.master_client.findFirstOrThrow({
      where: { delivery_group_id: sheet.group_id, is_active: true },
    });

    const product = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'GOV-COW-500' },
    });

    await ordersService.saveNightEntriesService(sheet.id, [
      { clientId: client.id, productId: product.id, orderedQty: 20 },
    ]);

    const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor A' },
    });

    const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
      where: { vehicle_number: 'MH01AA1001' },
    });

    const baseDto = {
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
          category: SupplyCategory.MILK,
          productId: product.id,
          allocatedQty: 20,
        },
      ],
    };

    // First save establishes the vehicle_allocation_paper row and its
    // baseline updated_at.
    await vehicleAllocationService.saveVehicleAllocations(paper.id, baseDto);

    const allocationPaper =
      await testPrisma.vehicle_allocation_paper.findUniqueOrThrow({
        where: {
          order_paper_id_delivery_session: {
            order_paper_id: paper.id,
            delivery_session: DeliverySession.NIGHT,
          },
        },
      });

    const sharedExpectedUpdatedAt = allocationPaper.updated_at.toISOString();

    // Two genuinely concurrent saves, both reading the SAME
    // expectedUpdatedAt (simulating two clients that loaded the page
    // at the same moment), each trying to change the quantity to a
    // different value.
    const callA = vehicleAllocationService.saveVehicleAllocations(paper.id, {
      ...baseDto,
      expectedUpdatedAt: sharedExpectedUpdatedAt,
      allocations: [{ ...baseDto.allocations[0], allocatedQty: 30 }],
    });

    const callB = vehicleAllocationService.saveVehicleAllocations(paper.id, {
      ...baseDto,
      expectedUpdatedAt: sharedExpectedUpdatedAt,
      allocations: [{ ...baseDto.allocations[0], allocatedQty: 40 }],
    });

    const results = await Promise.allSettled([callA, callB]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed, the other must be rejected with 409.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0];
    expect(rejection.reason).toMatchObject({ status: 409 });

    // The winning write must be the one actually persisted — either
    // 30 or 40, but exactly one of them, never a torn/mixed value.
    const finalAllocation =
      await testPrisma.vehicle_allocation.findFirstOrThrow({
        where: {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle.id,
          product_id: product.id,
        },
      });

    expect([30, 40]).toContain(Number(finalAllocation.allocated_qty));
  });

  it('two concurrent saves with no expectedUpdatedAt supplied do not corrupt allocation state (last-writer-wins under serializable retry)', async () => {
    const orderDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const paper = await paperRepository.generatePaperFromOrderDate(orderDate);

    const groups = await paperRepository.getActiveGroups();
    await paperRepository.generateOrderSheets(paper.id, groups);

    const sheet = await testPrisma.order_sheet.findFirstOrThrow({
      where: { order_paper_id: paper.id },
    });

    const client = await testPrisma.master_client.findFirstOrThrow({
      where: { delivery_group_id: sheet.group_id, is_active: true },
    });

    const product = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'GOV-COW-500' },
    });

    await ordersService.saveNightEntriesService(sheet.id, [
      { clientId: client.id, productId: product.id, orderedQty: 20 },
    ]);

    const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor A' },
    });

    const vehicle = await testPrisma.master_vehicle.findFirstOrThrow({
      where: { vehicle_number: 'MH01AA1002' },
    });

    const dto = {
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
          category: SupplyCategory.MILK,
          productId: product.id,
          allocatedQty: 20,
        },
      ],
    };

    const [resultA, resultB] = await Promise.all([
      vehicleAllocationService.saveVehicleAllocations(paper.id, dto as any),
      vehicleAllocationService.saveVehicleAllocations(paper.id, dto as any),
    ]);

    expect(resultA).toBeDefined();
    expect(resultB).toBeDefined();

    const allocationPaper =
      await testPrisma.vehicle_allocation_paper.findUniqueOrThrow({
        where: {
          order_paper_id_delivery_session: {
            order_paper_id: paper.id,
            delivery_session: DeliverySession.NIGHT,
          },
        },
      });

    const allocations = await testPrisma.vehicle_allocation.findMany({
      where: { vehicle_allocation_paper_id: allocationPaper.id },
    });

    // No duplicate/torn rows — exactly one allocation row for the
    // identical (vehicle, distributor, category, product) combination.
    expect(allocations).toHaveLength(1);
    expect(Number(allocations[0].allocated_qty)).toBe(20);
  });
});
