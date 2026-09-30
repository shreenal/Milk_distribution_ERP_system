import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { buildAllocationKey } from '../../../common/utils/allocation-key.util.js';
import { diffByKey } from '../../../common/prisma/diff-by-key.util.js';
import { touchIfUnchanged } from '../../../common/prisma/touch-if-unchanged.util.js';

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

    if (toDelete.length > 0) {
      await db.vehicle_allocation.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }

    for (const { existingRow, incomingRow } of toUpdate) {
      await db.vehicle_allocation.update({
        where: { id: existingRow.id },
        data: { allocated_qty: incomingRow.allocated_qty },
      });
    }

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
    return touchIfUnchanged(
      db.vehicle_allocation_paper,
      { id: vehicleAllocationPaperId },
      'updated_at',
      expectedUpdatedAt,
    );
  }

  async getProductLinksBatch(
    pairs: { distributorId: number; productId: number }[],
    db: PrismaOrTransaction = this.prisma,
    activeOnly = false,
  ) {
    const links = await db.master_product_link.findMany({
      where: {
        OR: pairs.map((p) => ({
          distributor_id: p.distributorId,
          product_id: p.productId,
        })),
        ...(activeOnly ? { is_active: true } : {}),
      },
      select: { id: true, distributor_id: true, product_id: true },
    });

    const map = new Map<string, (typeof links)[number]>();
    for (const link of links) {
      map.set(`${link.distributor_id}_${link.product_id}`, link);
    }
    return map;
  }
}
