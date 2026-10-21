import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrismaOrTransaction } from '../../types/transaction.types.js';

@Injectable()
export class OrderItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderItemsWithSupplyContextByPaperId(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const items = await db.order_sheet_items.findMany({
      where: { order_sheet: { order_paper_id: paperId } },
      include: {
        order_sheet: {
          include: {
            master_group: {
              select: { id: true, name: true },
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
        product_link: {
          select: {
            distributor_id: true,
            distributor: { select: { name: true } },
          },
        },
      },
    });

    return items.map((item) => {
      const category = item.master_product.master_product_group.category;
      const distributorId = item.product_link.distributor_id;
      const distributorName = item.product_link.distributor.name;

      return {
        sheetId: item.order_sheet_id,
        groupId: item.order_sheet.group_id,
        groupName: item.order_sheet.master_group.name,
        deliverySession: item.order_sheet.delivery_session,
        clientId: item.client_id,
        distributorId,
        distributorName,
        category,
        productId: item.product_id,
        orderedQty: Number(item.ordered_qty ?? 0),
        brandId: item.master_product.master_brand.id,
        brandName: item.master_product.master_brand.name,
        productGroupId: item.master_product.master_product_group.id,
        productGroupName: item.master_product.master_product_group.name,
        productTypeId: item.master_product.master_product_type?.id ?? null,
        productTypeName: item.master_product.master_product_type?.name ?? null,
        packagingTypeId: item.master_product.master_packaging_type?.id ?? null,
        packagingTypeName:
          item.master_product.master_packaging_type?.name ?? null,
        master_product: item.master_product,
      };
    });
  }
}
