import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeliverySession, Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class PurchaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderPaperById(paperId: number) {
    return this.prisma.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async findPurchasePaper(orderPaperId: number) {
    return this.prisma.purchase_paper.findUnique({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async getOrCreatePurchasePaper(orderPaperId: number) {
    return this.prisma.purchase_paper.upsert({
      where: {
        order_paper_id: orderPaperId,
      },
      update: {},
      create: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async findVehicleAssignmentsByPaperId(paperId: number) {
    return this.prisma.vehicle_distribution_assignment.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: paperId,
        },
      },

      include: {
        master_vehicle: true,

        master_distributor: true,
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
) {
  return this.prisma.purchase_entry.findMany({
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
) {
    return this.prisma.$transaction(async (tx) => {
      await tx.purchase_entry.deleteMany({
        where: {
          purchase_paper_id: purchasePaperId,
        },
      });

      if (data.length > 0) {
        await tx.purchase_entry.createMany({
          data,
        });
      }
    });
  }

  async findVehicles() {
    return this.prisma.master_vehicle.findMany({
      where: {
        is_active: true,
      },

      orderBy: {
        id: 'asc',
      },
    });
  }

  async findProducts() {
    return this.prisma.master_product.findMany({
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

  async findDistributorProcurementRules() {
    return this.prisma.distributor_procurement_rule.findMany({
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

  async findVehicleAllocationsByPaperId(paperId: number) {
    return this.prisma.vehicle_allocation.findMany({
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

  async findVehicleAllocationPaper(orderPaperId: number) {
    return this.prisma.vehicle_allocation_paper.findMany({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async findProductLinkRateForDate(productLinkId: number, effectiveDate: Date) {
    return this.prisma.distributor_product_rate.findFirst({
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

  async getProductLink(distributorId: number, productId: number) {
    return this.prisma.master_product_link.findUnique({
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
  ) {
    const productLink = await this.getProductLink(distributorId, productId);

    if (!productLink) {
      return null;
    }

    return this.findProductLinkRateForDate(productLink.id, effectiveDate);
  }
}
