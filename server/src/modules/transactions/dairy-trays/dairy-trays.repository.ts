import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';

@Injectable()
export class DairyTraysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDairyTrayPaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    let dairyTrayPaper = await this.findDairyTrayPaperByOrderPaperId(
      orderPaperId,
      db,
    );

    if (!dairyTrayPaper) {
      dairyTrayPaper = await this.createDairyTrayPaper(orderPaperId, db);
    }

    return dairyTrayPaper;
  }

  async findDairyTrayPaperByOrderPaperId(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.dairy_tray_paper.findUnique({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async createDairyTrayPaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.dairy_tray_paper.create({
      data: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async findPaperById(paperId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async getTrayTypes(db: PrismaOrTransaction = this.prisma) {
    return db.master_tray_type.findMany({
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

  async getCurrentTrayTransactions(
    dairyTrayPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.dairy_tray_transaction.findMany({
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

  async getPreviousPaper(
    currentPaperId: number,
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findFirst({
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

  async getPreviousTrayBalances(
    dairyTrayPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.dairy_tray_transaction.findMany({
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

  async getVehicles(db: PrismaOrTransaction = this.prisma) {
    return db.master_vehicle.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        vehicle_name: 'asc',
      },
    });
  }

  // async getVehicleAllocations(paperId: number) {
  //   return this.prisma.vehicle_allocation.findMany({
  //     where: {
  //       vehicle_allocation_paper: {
  //         order_paper_id: paperId,
  //       },
  //     },

  //     include: {
  //       master_product: {
  //         include: {
  //           master_brand: true,
  //           master_product_group: true,
  //           master_product_type: true,
  //           master_packaging_type: true,
  //         },
  //       },
  //       master_vehicle: true,
  //     },
  //     orderBy: [
  //       { vehicle_id: 'asc' },
  //       { distributor_id: 'asc' },
  //       { category: 'asc' },
  //       { product_id: 'asc' },
  //     ],
  //   });
  // }

  async getPurchaseEntries(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.purchase_entry.findMany({
      where: {
        purchase_paper: {
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

  async getProductTrayRules(db: PrismaOrTransaction = this.prisma) {
    return db.product_tray_rule.findMany({
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
    db: PrismaOrTransaction = this.prisma,
  ) {
    await db.dairy_tray_transaction.deleteMany({
      where: {
        dairy_tray_paper_id: dairyTrayPaperId,
      },
    });

    if (data.length > 0) {
      await db.dairy_tray_transaction.createMany({
        data,
      });
    }
  }

  async getNextPaper(
    currentPaperId: number,
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findFirst({
      where: {
        id: {
          not: currentPaperId,
        },
        sale_date: {
          gt: saleDate,
        },
      },
      orderBy: {
        sale_date: 'asc',
      },
    });
  }

  async updateTrayReturns(
    dairyTrayPaperId: number,
    entries: {
      vehicleId: number;
      deliverySession: DeliverySession;
      trayTypeId: number;
      returned: number;
    }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (const entry of entries) {
      await db.dairy_tray_transaction.upsert({
        where: {
          dairy_tray_paper_id_delivery_session_vehicle_id_tray_type_id: {
            dairy_tray_paper_id: dairyTrayPaperId,
            delivery_session: entry.deliverySession,
            vehicle_id: entry.vehicleId,
            tray_type_id: entry.trayTypeId,
          },
        },
        update: {
          trays_returned: entry.returned,
        },
        create: {
          dairy_tray_paper_id: dairyTrayPaperId,
          vehicle_id: entry.vehicleId,
          delivery_session: entry.deliverySession,
          tray_type_id: entry.trayTypeId,
          trays_returned: entry.returned,
        },
      });
    }
  }
}
