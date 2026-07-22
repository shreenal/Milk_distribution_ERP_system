import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class OrderItemsRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findOrderItemsWithSupplyContextByPaperId(paperId: number) {
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
        throw new BadRequestException(
          `Missing supply rule for group ${item.order_sheet.master_group.name} and category ${category}`,
        );
      }

      return {
        groupId: item.order_sheet.group_id,
        groupName: item.order_sheet.master_group.name,
        deliverySession: item.order_sheet.master_group.delivery_session,

        productId: item.product_id,
        orderedQty: Number(item.ordered_qty ?? 0),

        distributorId: supplyRule.distributor_id,
        category,

        master_product: item.master_product,
      };
    });
  }
}
