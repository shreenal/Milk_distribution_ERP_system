import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';

@Injectable()
export class VehicleAllocationRepository {
  constructor(private readonly prisma: PrismaService) { }

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

  async findDistributorProcurementRules(db: PrismaOrTransaction = this.prisma) {
    return db.distributor_procurement_rule.findMany({
      where: {
        is_active: true,
      },
    });
  }

  async findOrderSheetsByPaperId(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.findMany({
      where: {
        order_paper_id: paperId,
      },
      include: {
        master_group: {
          select: {
            id: true,
            name: true,
            delivery_session: true,
          },
        },
      },
    });
  }

  async findSheetItemsByPaperId(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      include: {
        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },
      },
    });
  }

  async findDistributors(db: PrismaOrTransaction = this.prisma) {
    return db.master_distributor.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findProducts(db: PrismaOrTransaction = this.prisma) {
    return db.master_product.findMany({
      include: {
        master_brand: true,
        master_product_group: true,
        master_product_type: true,
        master_packaging_type: true,
      },
      orderBy: {
        id: 'asc',
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

  async findVehicleAllocationsByPaperId(
    orderPaperId: number,
    deliverySession: DeliverySession,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: orderPaperId,
          delivery_session: deliverySession,
        },
      },
      include: {
        master_vehicle: true,
        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },
      },
      orderBy: [
        { vehicle_id: 'asc' },
        { distributor_id: 'asc' },
        { category: 'asc' },
        { product_id: 'asc' },
      ],
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

    const keyOf = (
      row: Pick<
        Prisma.vehicle_allocationCreateManyInput,
        'vehicle_id' | 'distributor_id' | 'category' | 'product_id'
      >,
    ) =>
      `${row.vehicle_id}_${row.distributor_id}_${row.category}_${row.product_id}`;

    const existingByKey = new Map(existing.map((r) => [keyOf(r), r]));
    const incomingByKey = new Map(data.map((r) => [keyOf(r), r]));

    const toDelete = existing.filter((r) => !incomingByKey.has(keyOf(r)));
    const toInsert = data.filter((r) => !existingByKey.has(keyOf(r)));
    const toUpdate = data.filter((r) => {
      const match = existingByKey.get(keyOf(r));
      return (
        match !== undefined &&
        Number(match.allocated_qty) !== Number(r.allocated_qty)
      );
    });

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
    for (const row of toUpdate) {
      const existingRow = existingByKey.get(keyOf(row))!;
      await db.vehicle_allocation.update({
        where: { id: existingRow.id },
        data: { allocated_qty: row.allocated_qty },
      });
    }

    // Genuinely new (vehicle, distributor, category, product) combinations.
    if (toInsert.length > 0) {
      await db.vehicle_allocation.createMany({ data: toInsert });
    }
  }

  async findVehicleAssignments(
    vehicleAllocationPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_distribution_assignment.findMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },
      include: {
        master_vehicle: true,
        master_distributor: true,
      },
      orderBy: [{ vehicle_id: 'asc' }, { category: 'asc' }],
    });
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

  async deleteVehicleAssignments(
    vehicleAllocationPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_distribution_assignment.deleteMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },
    });
  }

  async createVehicleAssignments(
    data: Prisma.vehicle_distribution_assignmentCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_distribution_assignment.createMany({
      data,
    });
  }

  async replaceVehicleAssignments(
    vehicleAllocationPaperId: number,
    data: Prisma.vehicle_distribution_assignmentCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    await db.vehicle_distribution_assignment.deleteMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },
    });

    if (data.length > 0) {
      await db.vehicle_distribution_assignment.createMany({
        data,
      });
    }
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
