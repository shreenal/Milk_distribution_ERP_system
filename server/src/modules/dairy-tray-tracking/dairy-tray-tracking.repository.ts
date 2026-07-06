import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";


@Injectable()
export class DairyTrayTrackingRepository {
  constructor(private readonly prisma: PrismaService) { }

  async getOrCreateDairyTrayPaper(orderPaperId: number) {
  let dairyTrayPaper = await this.findDairyTrayPaperByOrderPaperId(
    orderPaperId,
  );

  if (!dairyTrayPaper) {
    dairyTrayPaper = await this.createDairyTrayPaper(orderPaperId);
  }

  return dairyTrayPaper;
}

  async getPaperStatusByPaperId(paperId: number) {
    const paper = await this.prisma.order_paper.findUnique({
      where: {
        id: paperId,
      },

      select: {
        status: true,
      },
    });

    if (!paper) {
      throw new NotFoundException('Paper status not found');
    }

    return paper.status;
  }

  async findDairyTrayPaperByOrderPaperId(orderPaperId: number) {
    return this.prisma.dairy_tray_paper.findUnique({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }


  async createDairyTrayPaper(orderPaperId: number) {
    return this.prisma.dairy_tray_paper.create({
      data: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async findPaperById(paperId: number) {
    return this.prisma.order_paper.findUnique({
      where: {
        id: paperId,
      },

      include: {
        dairy_tray_paper: {
          include: {
            dairy_tray_transactions: {
              include: {
                master_vehicle: true,
                master_tray_type: {
                  include: {
                    master_brand: true,
                  },
                },
              },
            },
          },
        },
        vehicle_allocation_paper: true,
      }
    });
  }

  async getTrayTypes() {
    return this.prisma.master_tray_type.findMany({
      where: {
        is_active: true,
      },

      include: {
        master_brand: true,
      },

      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },

        {
          color: 'asc',
        },
      ],
    });
  }

  async getCurrentTrayTransactions(dairyTrayPaperId: number) {
    return this.prisma.dairy_tray_transaction.findMany({
      where: {
        dairy_tray_paper_id: dairyTrayPaperId,
      },

      include: {
        master_vehicle: true,

        master_tray_type: {
          include: {
            master_brand: true,
          },
        },
      },
    });
  }

  async getPreviousPaper(currentPaperId: number, saleDate: Date) {
    return this.prisma.order_paper.findFirst({
      where: {
        id: {
          not: currentPaperId,
        },
        sale_date: {
          lt: saleDate,
        },
      },
      orderBy: {
        sale_date: 'desc',
      },
    });
  }

  async getPreviousTrayBalances(dairyTrayPaperId: number) {
    return this.prisma.dairy_tray_transaction.findMany({
      where: {
        dairy_tray_paper_id: dairyTrayPaperId,
      },
      include: {
        master_vehicle: true,

        master_tray_type: {
          include: {
            master_brand: true,
          },
        },
      }
    });
  }

  async getVehicles() {
    return this.prisma.master_vehicle.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        vehicle_name: 'asc',
      },
    });
  }

  async getVehicleAllocations(paperId: number) {
    return this.prisma.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: paperId,
        },
      },

      include: {
        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },
        master_vehicle: true,
      },
      orderBy: [
        { vehicle_id: 'asc' },
        { distributor_id: 'asc' },
        { category: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }


  async getProductTrayRules() {
    return this.prisma.product_tray_rule.findMany({
      where: {
        is_active: true,
      },

      include: {
        master_tray_type: {
          include: {
            master_brand: true,
          },
        },

        master_brand: true,

        master_product_group: true,

        master_product_type: true,

        master_packaging_type: true,
      },
    });
  }

  async replaceTrayTransactions(
  dairyTrayPaperId: number,
  data: Prisma.dairy_tray_transactionCreateManyInput[],
) {
  return this.prisma.$transaction(async (tx) => {
    await tx.dairy_tray_transaction.deleteMany({
      where: {
        dairy_tray_paper_id: dairyTrayPaperId,
      },
    });

    if (data.length > 0) {
      await tx.dairy_tray_transaction.createMany({
        data,
      });
    }
  });
}
}