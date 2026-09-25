import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { buildAllocationKey } from '../../../common/utils/allocation-key.util.js';
import { diffByKey } from '../../../common/prisma/diff-by-key.util.js';

@Injectable()
export class VehicleAllocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderPaperById(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async findVehicles(db: PrismaOrTransaction = this.prisma) {
    return db.master_vehicle.findMany({
      where: {
        is_active: true,
      },
    });
  }

  async getOrCreateVehicleAllocationPaper(
    orderPaperId: number,
    deliverySession: DeliverySession,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation_paper.upsert({
      where: {
        order_paper_id_delivery_session: {
          order_paper_id: orderPaperId,
          delivery_session: deliverySession,
        },
      },
      update: {},
      create: {
        order_paper_id: orderPaperId,
        delivery_session: deliverySession,
      },
    });
  }

  async deleteVehicleAllocations(
    vehicleAllocationPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation.deleteMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },
    });
  }

  async createVehicleAllocations(
    data: Prisma.vehicle_allocationCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation.createMany({
      data,
    });
  }

  async findVehicleAllocations(
    vehicleAllocationPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
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
  }

  async findVehicleAllocationPaper(
    orderPaperId: number,
    deliverySession: DeliverySession,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation_paper.findUnique({
      where: {
        order_paper_id_delivery_session: {
          order_paper_id: orderPaperId,
          delivery_session: deliverySession,
        },
      },
    });
  }

  async replaceVehicleAllocations(
    vehicleAllocationPaperId: number,
    data: Prisma.vehicle_allocationCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const existing = await db.vehicle_allocation.findMany({
      where: { vehicle_allocation_paper_id: vehicleAllocationPaperId },
    });

    // FIX F1/F9 (consistency review): key composition and diffing now come
    // from shared utilities (see purchase.repository.ts for the equivalent
    // purchase_entry version of this same pattern).
    const { toDelete, toInsert, toUpdate } = diffByKey(
      existing,
      data,
      buildAllocationKey,
      buildAllocationKey,
      (existingRow, incomingRow) =>
        Number(existingRow.allocated_qty) !== Number(incomingRow.allocated_qty),
    );

    // Rows genuinely removed from this session's plan. Any purchase_entry
    // pointing at these via source_allocation_id will be SetNull'd by the
    // FK — correct, because the source genuinely no longer exists. Purchase's
    // own read path (F5, orphanedEntries) already surfaces this case.
    if (toDelete.length > 0) {
      await db.vehicle_allocation.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }

    // Rows that still represent the same (vehicle, distributor, category,
    // product) but with a changed quantity — update in place, preserving
    // `id`, so any purchase_entry.source_allocation_id pointing here stays
    // valid. Purchase's staleness check will correctly flag these (their
    // allocated_qty now differs from what was purchased against), which is
    // the accurate, intended signal — not a side effect of an unrelated
    // row being touched.
    for (const { existingRow, incomingRow } of toUpdate) {
      await db.vehicle_allocation.update({
        where: { id: existingRow.id },
        data: { allocated_qty: incomingRow.allocated_qty },
      });
    }

    // Genuinely new (vehicle, distributor, category, product) combinations.
    if (toInsert.length > 0) {
      await db.vehicle_allocation.createMany({ data: toInsert });
    }
  }

  async getProductLink(
    distributorId: number,
    productId: number,
    db: PrismaOrTransaction = this.prisma,
    activeOnly = false,
  ) {
    return db.master_product_link.findUnique({
      where: {
        distributor_id_product_id: {
          distributor_id: distributorId,
          product_id: productId,
        },
        ...(activeOnly ? { is_active: true } : {}),
      },
      select: {
        id: true,
        distributor_id: true,
        product_id: true,
        is_active: true,
      },
    });
  }

  async touchVehicleAllocationPaperIfUnchanged(
    vehicleAllocationPaperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation_paper.updateMany({
      where: {
        id: vehicleAllocationPaperId,
        updated_at: expectedUpdatedAt,
      },
      data: {
        updated_at: new Date(),
      },
    });
  }
}
