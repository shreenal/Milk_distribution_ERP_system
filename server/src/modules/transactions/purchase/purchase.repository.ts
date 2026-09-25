import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { buildPurchaseKey } from '../../../common/utils/allocation-key.util.js';
import { diffByKey } from '../../../common/prisma/diff-by-key.util.js';

@Injectable()
export class PurchaseRepository {
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

  async findPurchasePaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_paper.findUnique({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async getOrCreatePurchasePaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_paper.upsert({
      where: {
        order_paper_id: orderPaperId,
      },
      update: {},
      create: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async findPurchaseEntries(
    purchasePaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_entry.findMany({
      where: {
        purchase_paper_id: purchasePaperId,
      },
      include: {
        product_link: true,
        master_product: true,
      },
      orderBy: [
        { distributor_id: 'asc' },
        { category: 'asc' },
        { vehicle_id: 'asc' },
        { gatepass_date: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }

  async replacePurchaseEntries(
    purchasePaperId: number,
    data: Prisma.purchase_entryCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const existing = await db.purchase_entry.findMany({
      where: { purchase_paper_id: purchasePaperId },
    });

    // FIX F1/F9 (consistency review): key composition and diffing now come
    // from shared utilities (see vehicle-allocation.repository.ts for the
    // equivalent vehicle_allocation version of this same pattern).
    const { toDelete, toInsert, toUpdate } = diffByKey(
      existing,
      data,
      buildPurchaseKey,
      buildPurchaseKey,
      (match, r) =>
        Number(match.purchased_qty) !== Number(r.purchased_qty) ||
        Number(match.purchase_rate) !== Number(r.purchase_rate) ||
        Number(match.purchase_amount) !== Number(r.purchase_amount) ||
        match.source_allocation_id !== r.source_allocation_id ||
        Number(match.source_allocated_qty ?? NaN) !==
          Number(r.source_allocated_qty ?? NaN) ||
        (match.tray_type_id ?? null) !== (r.tray_type_id ?? null) ||
        match.product_link_id !== r.product_link_id ||
        match.gatepass_date.getTime() !== new Date(r.gatepass_date).getTime(),
    );

    if (toDelete.length > 0) {
      await db.purchase_entry.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }

    for (const { existingRow, incomingRow } of toUpdate) {
      await db.purchase_entry.update({
        where: { id: existingRow.id },
        data: {
          purchased_qty: incomingRow.purchased_qty,
          purchase_rate: incomingRow.purchase_rate,
          purchase_amount: incomingRow.purchase_amount,
          source_allocation_id: incomingRow.source_allocation_id,
          source_allocated_qty: incomingRow.source_allocated_qty,
          tray_type_id: incomingRow.tray_type_id,
          gatepass_date: incomingRow.gatepass_date,
          product_link_id: incomingRow.product_link_id,
        },
      });
    }

    if (toInsert.length > 0) {
      await db.purchase_entry.createMany({ data: toInsert });
    }
  }

  async findVehicles(db: PrismaOrTransaction = this.prisma) {
    return db.master_vehicle.findMany({
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

  async findDistributorProcurementRules(db: PrismaOrTransaction = this.prisma) {
    return db.distributor_procurement_rule.findMany({
      where: {
        is_active: true,
      },

      include: {
        master_distributor: true,

        master_brand: true,

        master_product_group: true,
      },

      orderBy: [
        { distributor_id: 'asc' },
        { category: 'asc' },
        { brand_id: 'asc' },
        { product_group_id: 'asc' },
      ],
    });
  }

  async findVehicleAllocationsByPaperId(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: paperId,
        },
      },

      include: {
        master_vehicle: true,

        distributor: true,

        vehicle_allocation_paper: {
          select: {
            delivery_session: true,
          },
        },

        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
            product_order_unit: {
              select: {
                units_per_order_unit: true,
                pricing_quantity: true,
                pricing_unit: true,
              },
            },
          },
        },
      },
      orderBy: [
        { distributor_id: 'asc' },
        { category: 'asc' },
        { vehicle_id: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }

  async findVehicleAllocationPapersForOrderPaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation_paper.findMany({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async findProductLinkRateForDate(
    productLinkId: number,
    effectiveDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.distributor_product_rate.findFirst({
      where: {
        product_link_id: productLinkId,
        is_active: true,
        effective_from: {
          lte: effectiveDate,
        },
        OR: [{ effective_to: null }, { effective_to: { gte: effectiveDate } }],
      },
      orderBy: {
        effective_from: 'desc',
      },
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

  async findPurchaseRateForDistributorProduct(
    distributorId: number,
    productId: number,
    effectiveDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const productLink = await this.getProductLink(distributorId, productId, db);

    if (!productLink) {
      return null;
    }

    return this.findProductLinkRateForDate(productLink.id, effectiveDate, db);
  }

  async findLatestVehicleAllocationPaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_allocation_paper.findFirst({
      where: {
        order_paper_id: orderPaperId,
      },
      orderBy: {
        updated_at: 'desc',
      },
      select: {
        id: true,
        updated_at: true,
        delivery_session: true,
      },
    });
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
      select: {
        id: true,
        distributor_id: true,
        product_id: true,
        is_active: true,
      },
    });

    const map = new Map<string, (typeof links)[number]>();
    for (const link of links) {
      map.set(`${link.distributor_id}_${link.product_id}`, link);
    }
    return map;
  }

  async findProductLinkRatesForDateBatch(
    requests: { productLinkId: number; effectiveDate: Date }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const linkIds = [...new Set(requests.map((r) => r.productLinkId))];

    // Fetch all active rates for these links; resolve per-request effective
    // date in memory (dates can differ per request due to gatepass policy).
    const rates = await db.distributor_product_rate.findMany({
      where: {
        product_link_id: { in: linkIds },
        is_active: true,
      },
      orderBy: { effective_from: 'desc' },
    });

    const resolved = new Map<string, (typeof rates)[number] | null>();

    for (const { productLinkId, effectiveDate } of requests) {
      const key = `${productLinkId}_${effectiveDate.toISOString()}`;
      const match = rates.find(
        (r) =>
          r.product_link_id === productLinkId &&
          r.effective_from <= effectiveDate &&
          (r.effective_to === null || r.effective_to >= effectiveDate),
      );
      resolved.set(key, match ?? null);
    }

    return resolved;
  }

  async touchPurchasePaperIfUnchanged(
    purchasePaperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ): Promise<boolean> {
    const result = await db.purchase_paper.updateMany({
      where: {
        id: purchasePaperId,
        updated_at: expectedUpdatedAt,
      },
      data: {
        updated_at: new Date(),
      },
    });

    return result.count === 1;
  }
}
