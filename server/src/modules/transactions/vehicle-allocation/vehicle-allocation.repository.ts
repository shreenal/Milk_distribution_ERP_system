import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  DeliverySession,
  Prisma,
  SupplyCategory,
  VehicleAllocationAnomalyReason,
  VehicleAllocationAnomalyStatus,
} from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { buildAllocationKey } from '../../../common/utils/allocation-key.util.js';
import { diffByKey } from '../../../common/prisma/diff-by-key.util.js';
import {
  touchIfTokenMatches,
  touchIfUnchanged,
} from '../../../common/prisma/touch-if-unchanged.util.js';
import { STALE_DATA_MESSAGE } from './vehicle-allocation.constants.js';

const isUniqueViolation = (e: any): boolean =>
  e?.code === '23505' ||
  e?.code === 'P2002' ||
  e?.meta?.code === '23505' ||
  e?.cause?.originalCode === '23505' ||
  e?.meta?.driverAdapterError?.cause?.originalCode === '23505';

const labelledProductInclude = {
  master_brand: true,
  master_product_group: true,
  master_product_type: true,
  master_packaging_type: true,
} as const;

// A nullable value changed? (null === null is "unchanged")
const nullableDiffers = (a: unknown, b: unknown): boolean => {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) return aNull !== bNull;
  return Number(a) !== Number(b);
};

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

  // VA-3.6: deterministic order (name, then id). Vehicles without a name sort last.
  async findVehicles(db: PrismaOrTransaction = this.prisma) {
    return db.master_vehicle.findMany({
      where: {
        is_active: true,
      },
      orderBy: [{ vehicle_name: 'asc' }, { id: 'asc' }],
    });
  }

  // Active or not: used to tell "unknown" from "inactive" (VA-5.8).
  async findVehiclesByIds(
    vehicleIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (vehicleIds.length === 0) return [];
    return db.master_vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: {
        id: true,
        vehicle_name: true,
        vehicle_number: true,
        is_active: true,
      },
    });
  }

  async findProductsForLabels(
    productIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (productIds.length === 0) return [];
    return db.master_product.findMany({
      where: { id: { in: productIds } },
      include: labelledProductInclude,
    });
  }

  async findDistributorsByIds(
    distributorIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (distributorIds.length === 0) return [];
    return db.master_distributor.findMany({
      where: { id: { in: distributorIds } },
      select: { id: true, name: true },
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

  /**
   * VA-9.2: first save. A plain INSERT, never an upsert, so two concurrent
   * first saves cannot both succeed: the loser hits the unique key (or a
   * serialization failure, which is retried and then sees the paper).
   */
  async createVehicleAllocationPaper(
    orderPaperId: number,
    deliverySession: DeliverySession,
    db: PrismaOrTransaction = this.prisma,
  ) {
    try {
      return await db.vehicle_allocation_paper.create({
        data: {
          order_paper_id: orderPaperId,
          delivery_session: deliverySession,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(STALE_DATA_MESSAGE);
      }
      throw e;
    }
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

  async deleteVehicleAllocationsByIds(
    ids: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (ids.length === 0) return;
    await db.vehicle_allocation.deleteMany({ where: { id: { in: ids } } });
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
        distributor: true,
        master_product: { include: labelledProductInclude },
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

    const { toDelete, toInsert, toUpdate } = diffByKey(
      existing,
      data,
      buildAllocationKey,
      buildAllocationKey,
      (existingRow, incomingRow) =>
        Number(existingRow.allocated_qty) !==
          Number(incomingRow.allocated_qty) ||
        nullableDiffers(
          existingRow.required_qty_at_save,
          incomingRow.required_qty_at_save,
        ),
    );

    if (toDelete.length > 0) {
      await db.vehicle_allocation.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }

    for (const { existingRow, incomingRow } of toUpdate) {
      await db.vehicle_allocation.update({
        where: { id: existingRow.id },
        data: {
          allocated_qty: incomingRow.allocated_qty,
          required_qty_at_save: incomingRow.required_qty_at_save,
        },
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

  // Pre-existing helper (not used by the module any more; kept for other callers).
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

  // VA-9: compare-and-advance, returning the new token (same helper as Orders / Client Trays).
  async touchVehicleAllocationPaperIfTokenMatches(
    vehicleAllocationPaperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
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

  // ---------------------------------------------------------------------
  // Anomaly evidence (VA-7)
  // ---------------------------------------------------------------------

  async findAnomalies(
    vehicleAllocationPaperId: number,
    status: VehicleAllocationAnomalyStatus,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation_anomaly.findMany({
      where: { vehicle_allocation_paper_id: vehicleAllocationPaperId, status },
      include: {
        master_vehicle: true,
        distributor: true,
        master_product: { include: labelledProductInclude },
      },
      orderBy: [{ flagged_at: 'asc' }, { id: 'asc' }],
    });
  }

  async upsertAnomaly(
    data: {
      vehicleAllocationPaperId: number;
      vehicleId: number;
      distributorId: number;
      category: SupplyCategory;
      productId: number;
      removedQty: number | Prisma.Decimal;
      reason: VehicleAllocationAnomalyReason;
    },
    db: PrismaOrTransaction = this.prisma,
  ) {
    const cell = {
      vehicle_allocation_paper_id: data.vehicleAllocationPaperId,
      vehicle_id: data.vehicleId,
      distributor_id: data.distributorId,
      category: data.category,
      product_id: data.productId,
    };

    return db.vehicle_allocation_anomaly.upsert({
      where: { cell },
      create: {
        ...cell,
        removed_qty: data.removedQty,
        reason: data.reason,
        status: VehicleAllocationAnomalyStatus.FLAGGED,
      },
      update: {
        removed_qty: data.removedQty,
        reason: data.reason,
        status: VehicleAllocationAnomalyStatus.FLAGGED,
        flagged_at: new Date(),
        reconciled_at: null,
      },
    });
  }

  async markAnomaliesReconciled(
    ids: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (ids.length === 0) return;
    await db.vehicle_allocation_anomaly.updateMany({
      where: { id: { in: ids } },
      data: {
        status: VehicleAllocationAnomalyStatus.RECONCILED,
        reconciled_at: new Date(),
      },
    });
  }
}
