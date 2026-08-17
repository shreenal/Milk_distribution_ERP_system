import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  PurchaseVarianceReason,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';

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

  async findVehicleAssignmentsByPaperId(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.vehicle_distribution_assignment.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: paperId,
        },
      },

      include: {
        master_vehicle: true,

        master_distributor: true,
        vehicle_allocation_paper: {
          select: {
            delivery_session: true,
          },
        },
      },

      orderBy: [
        {
          vehicle_id: 'asc',
        },
        {
          category: 'asc',
        },
      ],
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
    await db.purchase_entry.deleteMany({
      where: {
        purchase_paper_id: purchasePaperId,
      },
    });

    if (data.length > 0) {
      await db.purchase_entry.createMany({
        data,
      });
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

  async findVehicleAllocationPaper(
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
  ) {
    return db.master_product_link.findUnique({
      where: {
        distributor_id_product_id: {
          distributor_id: distributorId,
          product_id: productId,
        },
      },
      select: {
        id: true,
        distributor_id: true,
        product_id: true,
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

  async findVarianceAcknowledgements(
    purchasePaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_variance_acknowledgement.findMany({
      where: {
        purchase_entry: {
          purchase_paper_id: purchasePaperId,
        },
      },

      include: {
        purchase_entry: {
          select: {
            id: true,
            distributor_id: true,
            category: true,
            vehicle_id: true,
            product_id: true,
            delivery_session: true,
          },
        },

        user: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  async upsertVarianceAcknowledgement(
    purchaseEntryId: number,
    acknowledgedBy: number,
    reason: PurchaseVarianceReason,
    remarks: string | null,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_variance_acknowledgement.upsert({
      where: {
        purchase_entry_id: purchaseEntryId,
      },

      update: {
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date(),
        reason,
        remarks,
      },

      create: {
        purchase_entry_id: purchaseEntryId,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date(),
        reason,
        remarks,
      },
    });
  }
}
