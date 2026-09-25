import 'reflect-metadata';

import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DeliverySession,
  PrismaClient,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { VehicleAllocationValidationService } from './services/vehicle-allocation-validation.service.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import { WorkflowStateService } from '../../transactions/workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../../transactions/workflow/workflow.builder.js';

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

async function getSeedData() {
  const [vehicle1, vehicle2, distributorA, productCow500, productCow1000] =
    await Promise.all([
      prisma.master_vehicle.findUnique({
        where: { vehicle_number: 'MH01AA1001' },
      }),
      prisma.master_vehicle.findUnique({
        where: { vehicle_number: 'MH01AA1002' },
      }),
      prisma.master_distributor.findUnique({
        where: { name: 'Distributor A' },
      }),
      prisma.master_product.findUnique({
        where: { code: 'GOV-COW-500' },
      }),
      prisma.master_product.findUnique({
        where: { code: 'GOV-COW-1000' },
      }),
    ]);

  if (
    !vehicle1 ||
    !vehicle2 ||
    !distributorA ||
    !productCow500 ||
    !productCow1000
  ) {
    throw new Error('Vehicle Allocation integration seed is incomplete.');
  }

  return {
    vehicle1,
    vehicle2,
    distributorA,
    productCow500,
    productCow1000,
  };
}

let testSequence = 0;

async function createOrderPaper() {
  testSequence += 1;

  const baseDate = new Date();
  baseDate.setUTCHours(0, 0, 0, 0);
  baseDate.setUTCDate(baseDate.getUTCDate() + testSequence);

  let candidate = baseDate;

  // order_date is @unique.
  // Move forward until an unused date is found.
  while (
    await prisma.order_paper.findUnique({
      where: { order_date: candidate },
      select: { id: true },
    })
  ) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return prisma.order_paper.create({
    data: {
      order_date: candidate,
      sale_date: candidate,
    },
  });
}

async function createAllocationPaper(orderPaperId: number) {
  return prisma.vehicle_allocation_paper.create({
    data: {
      order_paper_id: orderPaperId,
      delivery_session: DeliverySession.MORNING,
    },
  });
}

async function createAllocation(params: {
  paperId: number;
  vehicleId: number;
  distributorId: number;
  productId: number;
  allocatedQty: string | number;
  category?: SupplyCategory;
}) {
  return prisma.vehicle_allocation.create({
    data: {
      vehicle_allocation_paper_id: params.paperId,
      vehicle_id: params.vehicleId,
      distributor_id: params.distributorId,
      product_id: params.productId,
      category: params.category ?? SupplyCategory.MILK,
      allocated_qty: params.allocatedQty,
    },
  });
}

async function createAssignment(params: {
  paperId: number;
  vehicleId: number;
  distributorId: number;
  category?: SupplyCategory;
}) {
  return prisma.vehicle_distribution_assignment.create({
    data: {
      vehicle_allocation_paper_id: params.paperId,
      vehicle_id: params.vehicleId,
      distributor_id: params.distributorId,
      category: params.category ?? SupplyCategory.MILK,
    },
  });
}

async function getAllocations(paperId: number) {
  return prisma.vehicle_allocation.findMany({
    where: {
      vehicle_allocation_paper_id: paperId,
    },
    orderBy: {
      id: 'asc',
    },
  });
}

async function getAssignments(paperId: number) {
  return prisma.vehicle_distribution_assignment.findMany({
    where: {
      vehicle_allocation_paper_id: paperId,
    },
    orderBy: {
      id: 'asc',
    },
  });
}

function createService() {
  const repository = new VehicleAllocationRepository(prisma);

  const validationService = {
    validateVehicleAssignments: async () => undefined,
    validateAllocationProductLinks: async () => undefined,
    validateVehicleAllocations: async () => undefined,
    validateNoDuplicateAllocations: () => undefined,
  } as unknown as VehicleAllocationValidationService;

  const workflowState = {
    getActiveExecutionSession: () => DeliverySession.MORNING,
    canEditVehicleAllocations: () => true,
  } as unknown as WorkflowStateService;

  return new VehicleAllocationService(
    repository,
    {} as VehicleAllocationBuilder,
    {} as AllocationSummaryBuilder,
    {} as OrderItemsRepository,
    validationService,
    workflowState,
    {} as WorkflowBuilder,
    prisma as unknown as PrismaService,
  );
}

describe('VehicleAllocationService - PostgreSQL integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('saveVehicleAllocations', () => {
    it('persists assignments and allocations through the real transaction', async () => {
      const { vehicle1, distributorA, productCow500 } = await getSeedData();

      const orderPaper = await createOrderPaper();

      const dto = {
        assignments: [
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
            productId: productCow500.id,
            allocatedQty: 25,
          },
        ],
      };

      const service = createService();

      const result = await service.saveVehicleAllocations(orderPaper.id, dto);

      expect(result).toEqual({
        success: true,
        changed: true,
      });

      const allocationPaper = await prisma.vehicle_allocation_paper.findUnique({
        where: {
          order_paper_id_delivery_session: {
            order_paper_id: orderPaper.id,
            delivery_session: DeliverySession.MORNING,
          },
        },
      });

      expect(allocationPaper).not.toBeNull();

      const allocations = await getAllocations(allocationPaper!.id);

      expect(allocations).toHaveLength(1);
      expect(allocations[0]).toMatchObject({
        vehicle_allocation_paper_id: allocationPaper!.id,
        vehicle_id: vehicle1.id,
        distributor_id: distributorA.id,
        category: SupplyCategory.MILK,
        product_id: productCow500.id,
      });
      expect(Number(allocations[0].allocated_qty)).toBe(25);

      const assignments = await getAssignments(allocationPaper!.id);

      expect(assignments).toHaveLength(1);
      expect(assignments[0]).toMatchObject({
        vehicle_allocation_paper_id: allocationPaper!.id,
        vehicle_id: vehicle1.id,
        distributor_id: distributorA.id,
        category: SupplyCategory.MILK,
      });
    });

    it('rejects a stale expectedUpdatedAt without changing database state', async () => {
      const { vehicle1, distributorA, productCow500 } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const allocation = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const assignment = await createAssignment({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
      });

      const beforePaper = await prisma.vehicle_allocation_paper.findUnique({
        where: { id: allocationPaper.id },
      });

      const beforeAllocation = await prisma.vehicle_allocation.findUnique({
        where: { id: allocation.id },
      });

      const beforeAssignment =
        await prisma.vehicle_distribution_assignment.findUnique({
          where: { id: assignment.id },
        });

      const service = createService();

      const dto = {
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        assignments: [
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
            productId: productCow500.id,
            allocatedQty: 999,
          },
        ],
      };

      await expect(
        service.saveVehicleAllocations(orderPaper.id, dto as any),
      ).rejects.toMatchObject({
        status: 409,
      });

      const afterPaper = await prisma.vehicle_allocation_paper.findUnique({
        where: { id: allocationPaper.id },
      });

      const afterAllocation = await prisma.vehicle_allocation.findUnique({
        where: { id: allocation.id },
      });

      const afterAssignment =
        await prisma.vehicle_distribution_assignment.findUnique({
          where: { id: assignment.id },
        });

      expect(afterPaper!.updated_at.getTime()).toBe(
        beforePaper!.updated_at.getTime(),
      );

      expect(afterAllocation!.id).toBe(beforeAllocation!.id);
      expect(Number(afterAllocation!.allocated_qty)).toBe(
        Number(beforeAllocation!.allocated_qty),
      );
      expect(afterAllocation!.updated_at.getTime()).toBe(
        beforeAllocation!.updated_at.getTime(),
      );

      expect(afterAssignment!.id).toBe(beforeAssignment!.id);
      expect(afterAssignment!.updated_at.getTime()).toBe(
        beforeAssignment!.updated_at.getTime(),
      );
    });

    it('does not modify the allocation paper timestamp on an identical save', async () => {
      const { vehicle1, distributorA, productCow500 } = await getSeedData();

      const orderPaper = await createOrderPaper();

      const service = createService();

      const dto = {
        assignments: [
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
            productId: productCow500.id,
            allocatedQty: 10,
          },
        ],
      };

      await service.saveVehicleAllocations(orderPaper.id, dto);

      const allocationPaper = await prisma.vehicle_allocation_paper.findUnique({
        where: {
          order_paper_id_delivery_session: {
            order_paper_id: orderPaper.id,
            delivery_session: DeliverySession.MORNING,
          },
        },
      });

      expect(allocationPaper).not.toBeNull();

      const beforeTimestamp = allocationPaper!.updated_at.getTime();

      await new Promise((resolve) => setTimeout(resolve, 30));

      const secondResult = await service.saveVehicleAllocations(orderPaper.id, {
        ...dto,
        expectedUpdatedAt: allocationPaper!.updated_at.toISOString(),
      });

      expect(secondResult).toEqual({
        success: true,
        changed: false,
      });

      const after = await prisma.vehicle_allocation_paper.findUnique({
        where: { id: allocationPaper!.id },
      });

      expect(after!.updated_at.getTime()).toBe(beforeTimestamp);
    });

    it('updates an allocation in place through the service', async () => {
      const { vehicle1, distributorA, productCow500 } = await getSeedData();

      const orderPaper = await createOrderPaper();

      const service = createService();

      const initialDto = {
        assignments: [
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
            productId: productCow500.id,
            allocatedQty: 10,
          },
        ],
      };

      await service.saveVehicleAllocations(orderPaper.id, initialDto);

      const allocationPaper = await prisma.vehicle_allocation_paper.findUnique({
        where: {
          order_paper_id_delivery_session: {
            order_paper_id: orderPaper.id,
            delivery_session: DeliverySession.MORNING,
          },
        },
      });

      const before = await getAllocations(allocationPaper!.id);

      expect(before).toHaveLength(1);

      const originalId = before[0].id;

      await new Promise((resolve) => setTimeout(resolve, 20));

      await service.saveVehicleAllocations(orderPaper.id, {
        ...initialDto,
        expectedUpdatedAt: allocationPaper!.updated_at.toISOString(),
        allocations: [
          {
            ...initialDto.allocations[0],
            allocatedQty: 35,
          },
        ],
      });

      const after = await getAllocations(allocationPaper!.id);

      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(originalId);
      expect(Number(after[0].allocated_qty)).toBe(35);
    });

    it('sets purchase_entry.source_allocation_id to NULL when a saved allocation is removed', async () => {
      const { vehicle1, distributorA, productCow500 } = await getSeedData();

      const orderPaper = await createOrderPaper();

      const service = createService();

      const initialDto = {
        assignments: [
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
            productId: productCow500.id,
            allocatedQty: 40,
          },
        ],
      };

      await service.saveVehicleAllocations(orderPaper.id, initialDto);

      const allocationPaper = await prisma.vehicle_allocation_paper.findUnique({
        where: {
          order_paper_id_delivery_session: {
            order_paper_id: orderPaper.id,
            delivery_session: DeliverySession.MORNING,
          },
        },
      });

      const allocationRows = await getAllocations(allocationPaper!.id);

      const allocation = allocationRows[0];

      const purchasePaper = await prisma.purchase_paper.create({
        data: {
          order_paper_id: orderPaper.id,
        },
      });

      const productLink = await prisma.master_product_link.findUnique({
        where: {
          distributor_id_product_id: {
            distributor_id: distributorA.id,
            product_id: productCow500.id,
          },
        },
      });

      if (!productLink) {
        throw new Error('Expected seeded product link was not found.');
      }

      const purchaseEntry = await prisma.purchase_entry.create({
        data: {
          purchase_paper_id: purchasePaper.id,
          vehicle_id: vehicle1.id,
          product_id: productCow500.id,
          purchased_qty: '40.00',
          purchase_amount: '1000.00',
          purchase_rate: '25.00',
          distributor_id: distributorA.id,
          gatepass_date: new Date('2090-01-01'),
          category: SupplyCategory.MILK,
          product_link_id: productLink.id,
          delivery_session: DeliverySession.MORNING,
          source_allocation_id: allocation.id,
          source_allocated_qty: '40.00',
        },
      });

      expect(
        (await prisma.purchase_entry.findUnique({
          where: { id: purchaseEntry.id },
        }))!.source_allocation_id,
      ).toBe(allocation.id);

      await service.saveVehicleAllocations(orderPaper.id, {
        assignments: [],
        allocations: [],
        expectedUpdatedAt: allocationPaper!.updated_at.toISOString(),
      } as any);

      const deletedAllocation = await prisma.vehicle_allocation.findUnique({
        where: { id: allocation.id },
      });

      expect(deletedAllocation).toBeNull();

      const updatedPurchaseEntry = await prisma.purchase_entry.findUnique({
        where: { id: purchaseEntry.id },
      });

      expect(updatedPurchaseEntry!.source_allocation_id).toBeNull();
    });

    it('rolls back assignments and allocations when persistence fails', async () => {
      const { vehicle1, distributorA, productCow500 } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const existingAllocation = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const existingAssignment = await createAssignment({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
      });

      const beforeAllocations = await getAllocations(allocationPaper.id);

      const beforeAssignments = await getAssignments(allocationPaper.id);

      expect(beforeAllocations).toHaveLength(1);
      expect(beforeAssignments).toHaveLength(1);

      const service = createService();

      // Two identical assignment rows for the same vehicle/category
      // violate the real PostgreSQL unique constraint:
      //
      // vehicle_allocation_paper_id + vehicle_id + category
      //
      // The repository will delete the old assignment first, then
      // createMany will fail. The surrounding Prisma transaction must
      // roll that deletion back.
      const failingDto = {
        assignments: [
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
          {
            vehicleId: vehicle1.id,
            milkDistributorId: distributorA.id,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
            productId: productCow500.id,
            allocatedQty: 999,
          },
        ],
      };

      await expect(
        service.saveVehicleAllocations(orderPaper.id, failingDto as any),
      ).rejects.toBeDefined();

      const afterAllocations = await getAllocations(allocationPaper.id);

      const afterAssignments = await getAssignments(allocationPaper.id);

      expect(afterAllocations).toHaveLength(1);
      expect(afterAllocations[0].id).toBe(existingAllocation.id);
      expect(Number(afterAllocations[0].allocated_qty)).toBe(10);

      expect(afterAssignments).toHaveLength(1);
      expect(afterAssignments[0].id).toBe(existingAssignment.id);
      expect(afterAssignments[0].vehicle_id).toBe(vehicle1.id);
      expect(afterAssignments[0].distributor_id).toBe(distributorA.id);
      expect(afterAssignments[0].category).toBe(SupplyCategory.MILK);
    });
  });
});
