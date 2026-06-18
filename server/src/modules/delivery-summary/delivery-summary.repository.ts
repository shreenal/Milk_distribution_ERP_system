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
}
