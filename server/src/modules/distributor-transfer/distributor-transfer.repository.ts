import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class DistributorTransferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderPaperById(paperId: number) {
    return this.prisma.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async getTransferSourceItems(paperId: number) {
    return this.prisma.order_sheet_items.findMany({
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

                supply_rules: {
                  where: {
                    is_active: true,
                  },
                  include: {
                    distributor: true,
                  },
                },
              },
            },
          },
        },

        master_client: {
          include: {
            billing_group: true,
            owner_distributor: true,
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
        {
          order_sheet: {
            group_id: 'asc',
          },
        },
        {
          client_id: 'asc',
        },
        {
          product_id: 'asc',
        },
      ],
    });
  }

  async findTransferRules() {
    return this.prisma.distributor_transfer_rule.findMany({
      where: {
        is_active: true,
      },

      include: {
        supplier_distributor: true,
        owner_distributor: true,
      },
    });
  }

  async findDistributorTransfers(orderPaperId: number) {
    return this.prisma.distributor_transfer.findMany({
      where: {
        order_paper_id: orderPaperId,
      },

      include: {
        supplier_distributor: true,

        owner_distributor: true,

        billing_group: true,

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
        { supplier_distributor_id: 'asc' },
        { owner_distributor_id: 'asc' },
        { billing_group_id: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }

  async replaceDistributorTransfers(
    orderPaperId: number,
    data: Prisma.distributor_transferCreateManyInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.distributor_transfer.deleteMany({
        where: {
          order_paper_id: orderPaperId,
        },
      });

      if (data.length > 0) {
        await tx.distributor_transfer.createMany({
          data,
        });
      }
    });
  }
}
