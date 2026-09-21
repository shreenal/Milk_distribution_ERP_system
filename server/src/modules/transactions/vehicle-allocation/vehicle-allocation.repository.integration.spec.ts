import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  DeliverySession,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VehicleAllocationRepository } from '../vehicle-allocation/vehicle-allocation.repository.js';

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
const repository = new VehicleAllocationRepository(prisma as any);

let testSequence = 0;

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
      'Vehicle Allocation integration seed is incomplete. ' +
        'Expected vehicles, distributors, and products were not found.',
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
  };
}

async function createOrderPaper() {
  testSequence += 1;

  // Unique dates avoid the order_paper @@unique constraints.
  const date = new Date(Date.UTC(2090, 0, testSequence));

  return prisma.order_paper.create({
    data: {
      order_date: date,
      sale_date: date,
    },
  });
}

async function createAllocationPaper(orderPaperId: number) {
  return prisma.vehicle_allocation_paper.create({
    data: {
      order_paper_id: orderPaperId,
      delivery_session: DeliverySession.NIGHT,
    },
  });
}

async function createAllocation(params: {
  paperId: number;
  vehicleId: number;
  distributorId: number;
  category: SupplyCategory;
  productId: number;
  allocatedQty: string | number;
}) {
  return prisma.vehicle_allocation.create({
    data: {
      vehicle_allocation_paper_id: params.paperId,
      vehicle_id: params.vehicleId,
      distributor_id: params.distributorId,
      category: params.category,
      product_id: params.productId,
      allocated_qty: params.allocatedQty,
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

describe('VehicleAllocationRepository - PostgreSQL integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('replaceVehicleAllocations', () => {
    it('updates an existing allocation in place and preserves its id', async () => {
      const {
        vehicle1,
        distributorA,
        productCow500,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const existing = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const before = await prisma.vehicle_allocation.findUnique({
        where: { id: existing.id },
      });

      expect(before).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 20));

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '25.00',
        },
      ]);

      const after = await prisma.vehicle_allocation.findUnique({
        where: { id: existing.id },
      });

      expect(after).not.toBeNull();
      expect(after!.id).toBe(existing.id);
      expect(Number(after!.allocated_qty)).toBe(25);
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
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const unchanged = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const changed = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle2.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow1000.id,
        allocatedQty: '20.00',
      });

      const beforeUnchanged = await prisma.vehicle_allocation.findUnique({
        where: { id: unchanged.id },
      });

      const beforeChanged = await prisma.vehicle_allocation.findUnique({
        where: { id: changed.id },
      });

      expect(beforeUnchanged).not.toBeNull();
      expect(beforeChanged).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 20));

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '10.00',
        },
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle2.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow1000.id,
          allocated_qty: '35.00',
        },
      ]);

      const afterUnchanged = await prisma.vehicle_allocation.findUnique({
        where: { id: unchanged.id },
      });

      const afterChanged = await prisma.vehicle_allocation.findUnique({
        where: { id: changed.id },
      });

      expect(afterUnchanged!.id).toBe(unchanged.id);
      expect(Number(afterUnchanged!.allocated_qty)).toBe(10);
      expect(afterUnchanged!.updated_at.getTime()).toBe(
        beforeUnchanged!.updated_at.getTime(),
      );

      expect(afterChanged!.id).toBe(changed.id);
      expect(Number(afterChanged!.allocated_qty)).toBe(35);
      expect(afterChanged!.updated_at.getTime()).toBeGreaterThan(
        beforeChanged!.updated_at.getTime(),
      );
    });

    it('deletes allocations that are no longer present', async () => {
      const {
        vehicle1,
        vehicle2,
        distributorA,
        productCow500,
        productCow1000,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const kept = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const removed = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle2.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow1000.id,
        allocatedQty: '20.00',
      });

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '10.00',
        },
      ]);

      const rows = await getAllocations(allocationPaper.id);

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(kept.id);

      const deletedRow = await prisma.vehicle_allocation.findUnique({
        where: { id: removed.id },
      });

      expect(deletedRow).toBeNull();
    });

    it('inserts genuinely new allocation combinations', async () => {
      const {
        vehicle1,
        vehicle2,
        distributorA,
        productCow500,
        productCow1000,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const existing = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '10.00',
        },
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle2.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow1000.id,
          allocated_qty: '15.50',
        },
      ]);

      const rows = await getAllocations(allocationPaper.id);

      expect(rows).toHaveLength(2);

      const existingAfter = rows.find((row) => row.id === existing.id);
      const inserted = rows.find(
        (row) =>
          row.vehicle_id === vehicle2.id &&
          row.product_id === productCow1000.id,
      );

      expect(existingAfter).toBeDefined();
      expect(inserted).toBeDefined();

      expect(Number(inserted!.allocated_qty)).toBe(15.5);
      expect(inserted!.id).not.toBe(existing.id);
    });

    it('does not touch allocations belonging to another allocation paper', async () => {
      const {
        vehicle1,
        vehicle2,
        distributorA,
        productCow500,
        productCow1000,
      } = await getSeedData();

      const orderPaper1 = await createOrderPaper();
      const orderPaper2 = await createOrderPaper();

      const paper1 = await createAllocationPaper(orderPaper1.id);
      const paper2 = await createAllocationPaper(orderPaper2.id);

      const targetRow = await createAllocation({
        paperId: paper1.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const unrelatedRow = await createAllocation({
        paperId: paper2.id,
        vehicleId: vehicle2.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow1000.id,
        allocatedQty: '50.00',
      });

      const beforeUnrelated = await prisma.vehicle_allocation.findUnique({
        where: { id: unrelatedRow.id },
      });

      await repository.replaceVehicleAllocations(paper1.id, [
        {
          vehicle_allocation_paper_id: paper1.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '30.00',
        },
      ]);

      const afterUnrelated = await prisma.vehicle_allocation.findUnique({
        where: { id: unrelatedRow.id },
      });

      expect(afterUnrelated!.id).toBe(unrelatedRow.id);
      expect(Number(afterUnrelated!.allocated_qty)).toBe(50);
      expect(afterUnrelated!.updated_at.getTime()).toBe(
        beforeUnrelated!.updated_at.getTime(),
      );

      const targetAfter = await prisma.vehicle_allocation.findUnique({
        where: { id: targetRow.id },
      });

      expect(Number(targetAfter!.allocated_qty)).toBe(30);
    });

    it('uses distributor, category, product, and vehicle as the allocation identity', async () => {
      const {
        vehicle1,
        distributorA,
        distributorB,
        productCow500,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const distributorAAllocation = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const distributorBAllocation = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorB.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '20.00',
      });

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '15.00',
        },
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorB.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '25.00',
        },
      ]);

      const rows = await getAllocations(allocationPaper.id);

      expect(rows).toHaveLength(2);

      expect(
        rows.find((row) => row.id === distributorAAllocation.id),
      ).toMatchObject({
        id: distributorAAllocation.id,
        distributor_id: distributorA.id,
        product_id: productCow500.id,
      });

      expect(
        rows.find((row) => row.id === distributorBAllocation.id),
      ).toMatchObject({
        id: distributorBAllocation.id,
        distributor_id: distributorB.id,
        product_id: productCow500.id,
      });

      expect(
        Number(
          rows.find((row) => row.id === distributorAAllocation.id)!
            .allocated_qty,
        ),
      ).toBe(15);

      expect(
        Number(
          rows.find((row) => row.id === distributorBAllocation.id)!
            .allocated_qty,
        ),
      ).toBe(25);
    });

    it('deletes all existing allocations when incoming data is empty', async () => {
      const {
        vehicle1,
        vehicle2,
        distributorA,
        productCow500,
        productCow1000,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle2.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow1000.id,
        allocatedQty: '20.00',
      });

      await repository.replaceVehicleAllocations(
        allocationPaper.id,
        [],
      );

      const rows = await getAllocations(allocationPaper.id);

      expect(rows).toEqual([]);
    });

    it('preserves Decimal quantities correctly', async () => {
      const {
        vehicle1,
        distributorA,
        productCow500,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const existing = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.25',
      });

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '123.45',
        },
      ]);

      const row = await prisma.vehicle_allocation.findUnique({
        where: { id: existing.id },
      });

      expect(row).not.toBeNull();
      expect(Number(row!.allocated_qty)).toBe(123.45);
    });

    it('sets purchase_entry.source_allocation_id to NULL when an allocation is deleted', async () => {
      const {
        vehicle1,
        distributorA,
        productCow500,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const allocation = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '40.00',
      });

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
        throw new Error(
          'Expected seeded product link for Distributor A / GOV-COW-500.',
        );
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
          delivery_session: DeliverySession.NIGHT,
          source_allocation_id: allocation.id,
          source_allocated_qty: '40.00',
        },
      });

      const before = await prisma.purchase_entry.findUnique({
        where: { id: purchaseEntry.id },
      });

      expect(before!.source_allocation_id).toBe(allocation.id);

      await repository.replaceVehicleAllocations(
        allocationPaper.id,
        [],
      );

      const after = await prisma.purchase_entry.findUnique({
        where: { id: purchaseEntry.id },
      });

      expect(after).not.toBeNull();
      expect(after!.source_allocation_id).toBeNull();
    });

    it('is a true no-op when incoming allocations are identical', async () => {
      const {
        vehicle1,
        vehicle2,
        distributorA,
        productCow500,
        productCow1000,
      } = await getSeedData();

      const orderPaper = await createOrderPaper();
      const allocationPaper = await createAllocationPaper(orderPaper.id);

      const first = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle1.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow500.id,
        allocatedQty: '10.00',
      });

      const second = await createAllocation({
        paperId: allocationPaper.id,
        vehicleId: vehicle2.id,
        distributorId: distributorA.id,
        category: SupplyCategory.MILK,
        productId: productCow1000.id,
        allocatedQty: '20.00',
      });

      const before = await getAllocations(allocationPaper.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      await repository.replaceVehicleAllocations(allocationPaper.id, [
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle1.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow500.id,
          allocated_qty: '10.00',
        },
        {
          vehicle_allocation_paper_id: allocationPaper.id,
          vehicle_id: vehicle2.id,
          distributor_id: distributorA.id,
          category: SupplyCategory.MILK,
          product_id: productCow1000.id,
          allocated_qty: '20.00',
        },
      ]);

      const after = await getAllocations(allocationPaper.id);

      expect(after).toHaveLength(2);

      expect(after.map((row) => row.id)).toEqual(
        before.map((row) => row.id),
      );

      for (const beforeRow of before) {
        const afterRow = after.find((row) => row.id === beforeRow.id);

        expect(afterRow).toBeDefined();
        expect(Number(afterRow!.allocated_qty)).toBe(
          Number(beforeRow.allocated_qty),
        );
        expect(afterRow!.updated_at.getTime()).toBe(
          beforeRow.updated_at.getTime(),
        );
      }

      expect(after.map((row) => row.id)).toEqual([
        first.id,
        second.id,
      ]);
    });
  });

  describe('replaceVehicleAssignments', () => {
    async function createAssignment(params: {
        paperId: number;
        vehicleId: number;
        distributorId: number;
        category: SupplyCategory;
    }) {
        return prisma.vehicle_distribution_assignment.create({
            data: {
                vehicle_allocation_paper_id: params.paperId,
                vehicle_id: params.vehicleId,
                distributor_id: params.distributorId,
                category: params.category,
            },
        });
    }

    async function getAssignments(paperId: number) {
        return prisma.vehicle_distribution_assignment.findMany({
            where: { vehicle_allocation_paper_id: paperId },
            orderBy: { id: 'asc' },
        });
    }

    it('deletes all existing assignments and inserts the new set', async () => {
        const { vehicle1, vehicle2, distributorA, distributorB } = await getSeedData();

        const orderPaper = await createOrderPaper();
        const allocationPaper = await createAllocationPaper(orderPaper.id);

        const existing = await createAssignment({
            paperId: allocationPaper.id,
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
        });

        await repository.replaceVehicleAssignments(allocationPaper.id, [
            {
                vehicle_allocation_paper_id: allocationPaper.id,
                vehicle_id: vehicle2.id,
                distributor_id: distributorB.id,
                category: SupplyCategory.MILK,
            },
        ]);

        const rows = await getAssignments(allocationPaper.id);

        expect(rows).toHaveLength(1);
        expect(rows[0].vehicle_id).toBe(vehicle2.id);
        expect(rows[0].distributor_id).toBe(distributorB.id);

        // The original row's id must genuinely be gone (delete-then-recreate,
        // not identity-preserving — this is the documented asymmetry vs.
        // replaceVehicleAllocations).
        const deletedRow = await prisma.vehicle_distribution_assignment.findUnique({
            where: { id: existing.id },
        });
        expect(deletedRow).toBeNull();
    });

    it('does not violate the (paper, vehicle, category) unique constraint when re-creating an identical assignment', async () => {
        const { vehicle1, distributorA } = await getSeedData();

        const orderPaper = await createOrderPaper();
        const allocationPaper = await createAllocationPaper(orderPaper.id);

        await createAssignment({
            paperId: allocationPaper.id,
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
        });

        await expect(
            repository.replaceVehicleAssignments(allocationPaper.id, [
                {
                    vehicle_allocation_paper_id: allocationPaper.id,
                    vehicle_id: vehicle1.id,
                    distributor_id: distributorA.id,
                    category: SupplyCategory.MILK,
                },
            ]),
        ).resolves.toBeUndefined();

        const rows = await getAssignments(allocationPaper.id);
        expect(rows).toHaveLength(1);
    });

    it('leaves assignments on a different allocation paper untouched', async () => {
        const { vehicle1, vehicle2, distributorA } = await getSeedData();

        const orderPaper1 = await createOrderPaper();
        const orderPaper2 = await createOrderPaper();

        const paper1 = await createAllocationPaper(orderPaper1.id);
        const paper2 = await createAllocationPaper(orderPaper2.id);

        const unrelated = await createAssignment({
            paperId: paper2.id,
            vehicleId: vehicle2.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
        });

        await repository.replaceVehicleAssignments(paper1.id, [
            {
                vehicle_allocation_paper_id: paper1.id,
                vehicle_id: vehicle1.id,
                distributor_id: distributorA.id,
                category: SupplyCategory.MILK,
            },
        ]);

        const stillThere = await prisma.vehicle_distribution_assignment.findUnique({
            where: { id: unrelated.id },
        });

        expect(stillThere).not.toBeNull();
    });

    it('deletes all assignments and inserts nothing when the incoming list is empty', async () => {
        const { vehicle1, distributorA } = await getSeedData();

        const orderPaper = await createOrderPaper();
        const allocationPaper = await createAllocationPaper(orderPaper.id);

        await createAssignment({
            paperId: allocationPaper.id,
            vehicleId: vehicle1.id,
            distributorId: distributorA.id,
            category: SupplyCategory.MILK,
        });

        await repository.replaceVehicleAssignments(allocationPaper.id, []);

        const rows = await getAssignments(allocationPaper.id);
        expect(rows).toEqual([]);
    });
});
});

