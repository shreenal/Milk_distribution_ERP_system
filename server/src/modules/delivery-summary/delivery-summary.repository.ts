import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class DeliverySummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDeliveredItemsByPaperId(paperId: number) {
    return this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },

      include: {
        master_client: {
          include: {
            billing_group: true,
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

  async findOrderPaperById(paperId: number) {
    return this.prisma.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async findDeliveredItemsWithSupplyContextByPaperId(paperId: number) {
    const items = await this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      include: {
        order_sheet: {
          include: {
            master_group: {
              select: {
                id: true,
                name: true,
                delivery_session: true,

                supply_rules: true,
              },
            },
          },
        },

        master_client: {
          include: {
            billing_group: true,
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
    });

    return items.map((item) => {
      const category = item.master_product.master_product_group.category;

      const supplyRule = item.order_sheet.master_group.supply_rules.find(
        (rule) => rule.category === category,
      );

      if (!supplyRule) {
        throw new Error(
          `Missing supply rule for group ${item.order_sheet.master_group.name} and category ${category}`,
        );
      }

      return {
        billingGroupId: item.master_client.billing_group.id,
        billingGroupName: item.master_client.billing_group.name,

        deliverySession: item.order_sheet.master_group.delivery_session,

        productId: item.product_id,
        deliveredQty: Number(item.delivered_qty ?? 0),

        distributorId: supplyRule.distributor_id,
        category,

        master_product: item.master_product,
      };
    });
  }
}
