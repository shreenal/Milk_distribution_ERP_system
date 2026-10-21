import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { STALE_DATA_MESSAGE } from './purchase.constants.js';

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
import { touchIfTokenMatches } from '../../../common/prisma/touch-if-unchanged.util.js';
import { resolveRateForDate, rateKey } from './purchase.util.js';

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

  // PD-12 / VA-9.2: a plain INSERT, never an upsert, so two concurrent first
  // saves cannot both succeed.
  async createPurchasePaper(
    orderPaperId: number,
    signOff?: { at: Date; by: number },
    db: PrismaOrTransaction = this.prisma,
  ) {
    try {
      return await db.purchase_paper.create({
        data: {
          order_paper_id: orderPaperId,
          ...(signOff
            ? { signed_off_at: signOff.at, signed_off_by: signOff.by }
            : {}),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(STALE_DATA_MESSAGE);
      throw e;
    }
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
        master_product: { include: labelledProductInclude },
        master_vehicle: true,
        distributor: true,
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

  // PD-5 / PD-11: writes are explicit. Nothing here deletes by omission.
  async createPurchaseEntries(
    data: Prisma.purchase_entryCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (data.length === 0) return;
    try {
      await db.purchase_entry.createMany({ data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(STALE_DATA_MESSAGE);
      throw e;
    }
  }

  async updatePurchaseEntry(
    id: number,
    data: Prisma.purchase_entryUncheckedUpdateInput,
    db: PrismaOrTransaction = this.prisma,
  ) {
    await db.purchase_entry.update({ where: { id }, data });
  }

  async deletePurchaseEntriesByIds(
    purchasePaperId: number,
    ids: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (ids.length === 0) return;
    await db.purchase_entry.deleteMany({
      where: { purchase_paper_id: purchasePaperId, id: { in: ids } },
    });
  }

  // Entries with everything the rate recalculation needs (PD-23).
  async findEntriesForRecalculation(
    purchasePaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_entry.findMany({
      where: { purchase_paper_id: purchasePaperId },
      include: {
        distributor: true,
        master_vehicle: true,
        master_product: {
          include: {
            ...labelledProductInclude,
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
      orderBy: { id: 'asc' },
    });
  }

  async findVehiclesByIds(
    ids: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (ids.length === 0) return [];
    return db.master_vehicle.findMany({ where: { id: { in: ids } } });
  }

  async findDistributorsByIds(
    ids: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (ids.length === 0) return [];
    return db.master_distributor.findMany({ where: { id: { in: ids } } });
  }

  async findProductsByIds(
    ids: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (ids.length === 0) return [];
    return db.master_product.findMany({
      where: { id: { in: ids } },
      include: labelledProductInclude,
    });
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
    const resolved = new Map<
      string,
      Awaited<ReturnType<typeof this.fetchRates>>[number] | null
    >();
    if (linkIds.length === 0) return resolved;

    const rates = await this.fetchRates(linkIds, db);

    // PD-26: each request's gatepass date is an IST calendar day; validity is
    // decided on IST days (see resolveRateForDate), not on UTC midnight.
    for (const { productLinkId, effectiveDate } of requests) {
      resolved.set(
        rateKey(productLinkId, effectiveDate),
        resolveRateForDate(
          rates.filter((r) => r.product_link_id === productLinkId),
          effectiveDate,
        ),
      );
    }

    return resolved;
  }

  private async fetchRates(linkIds: number[], db: PrismaOrTransaction) {
    return db.distributor_product_rate.findMany({
      where: { product_link_id: { in: linkIds }, is_active: true },
      orderBy: { effective_from: 'desc' },
    });
  }

  // PD-12 / PD-13: compare-and-advance, returning the new token (the same
  // clock-safe helper Orders, Client Trays, Collections and Vehicle Allocation use).
  async touchPurchasePaperIfTokenMatches(
    purchasePaperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
      db.purchase_paper,
      { id: purchasePaperId },
      'updated_at',
      expectedUpdatedAt,
    );
  }

  // PD-38: records the sign-off without moving the token again (the explicit
  // updated_at wins over @updatedAt).
  async recordSignOff(
    purchasePaperId: number,
    userId: number,
    at: Date,
    token: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    await db.purchase_paper.update({
      where: { id: purchasePaperId },
      data: { signed_off_at: at, signed_off_by: userId, updated_at: token },
    });
  }
}
