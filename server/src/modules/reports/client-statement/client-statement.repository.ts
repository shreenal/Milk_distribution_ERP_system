import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  SupplyCategory,
  OrderPaperStatus,
} from '../../../generated/prisma/enums.js';

@Injectable()
export class ClientStatementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findClientById(clientId: number) {
    return this.prisma.master_client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        shop_name: true,
      },
    });
  }

  async findFinalizedClientSales(
    clientId: number,
    category: SupplyCategory,
    from: Date,
    to: Date,
  ) {
    return this.prisma.order_sheet_items.findMany({
      where: {
        client_id: clientId,

        master_product: {
          master_product_group: {
            category,
          },
        },

        order_sheet: {
          order_paper: {
            status: OrderPaperStatus.FINALIZED,
            sale_date: {
              gte: from,
              lte: to,
            },
          },
        },
      },

      select: {
        product_id: true,
        delivered_qty: true,
        final_bill_amount: true,

        master_product: {
          select: {
            id: true,
            code: true,
            master_brand: {
              select: {
                id: true,
                name: true,
              },
            },
            master_product_group: {
              select: {
                id: true,
                name: true,
              },
            },
            master_product_type: {
              select: {
                id: true,
                name: true,
              },
            },
            master_packaging_type: {
              select: {
                id: true,
                name: true,
              },
            },
            packaging_size: true,
            packaging_unit: true,
          },
        },

        order_sheet: {
          select: {
            order_paper: {
              select: {
                sale_date: true,
              },
            },
          },
        },
      },
    });
  }

  async findFinalizedClientSalesBefore(
    clientId: number,
    category: SupplyCategory,
    beforeDate: Date,
  ) {
    return this.prisma.order_sheet_items.findMany({
      where: {
        client_id: clientId,

        master_product: {
          master_product_group: {
            category,
          },
        },

        order_sheet: {
          order_paper: {
            status: OrderPaperStatus.FINALIZED,
            sale_date: {
              lt: beforeDate,
            },
          },
        },
      },

      select: {
        final_bill_amount: true,
      },
    });
  }

  async findFinalizedClientCollections(
    clientId: number,
    category: SupplyCategory,
    from: Date,
    to: Date,
  ) {
    return this.prisma.client_collection.findMany({
      where: {
        client_id: clientId,
        category,

        order_sheet: {
          order_paper: {
            status: OrderPaperStatus.FINALIZED,
            sale_date: {
              gte: from,
              lte: to,
            },
          },
        },
      },

      select: {
        cash_collection: true,
        office_amount_given: true,
        cheque_collection: true,
        online_collection: true,
        bank_deposit: true,

        order_sheet: {
          select: {
            order_paper: {
              select: {
                sale_date: true,
              },
            },
          },
        },
      },
    });
  }

  async findFinalizedClientCollectionsBefore(
    clientId: number,
    category: SupplyCategory,
    beforeDate: Date,
  ) {
    return this.prisma.client_collection.findMany({
      where: {
        client_id: clientId,
        category,

        order_sheet: {
          order_paper: {
            status: OrderPaperStatus.FINALIZED,
            sale_date: {
              lt: beforeDate,
            },
          },
        },
      },

      select: {
        cash_collection: true,
        office_amount_given: true,
        cheque_collection: true,
        online_collection: true,
        bank_deposit: true,
      },
    });
  }
}
