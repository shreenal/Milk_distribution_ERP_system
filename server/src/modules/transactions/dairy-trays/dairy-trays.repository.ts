import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { touchIfUnchanged } from '../../../common/prisma/touch-if-unchanged.util.js';

@Injectable()
export class DairyTraysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDairyTrayPaper(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.dairy_tray_paper.upsert({
      where: { order_paper_id: orderPaperId },
      update: {},
      create: { order_paper_id: orderPaperId },
    });
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
    // Delete rows no longer represented (vehicle/session/tray-type
    // combination that no longer applies) — same as before.
    const incomingKeys = new Set(
      data.map(
        (d) => `${d.vehicle_id}_${d.delivery_session}_${d.tray_type_id}`,
      ),
    );

    const existing = await db.dairy_tray_transaction.findMany({
      where: { dairy_tray_paper_id: dairyTrayPaperId },
      select: {
        id: true,
        vehicle_id: true,
        delivery_session: true,
        tray_type_id: true,
      },
    });

    const toDeleteIds = existing
      .filter(
        (e) =>
          !incomingKeys.has(
            `${e.vehicle_id}_${e.delivery_session}_${e.tray_type_id}`,
          ),
      )
      .map((e) => e.id);

    if (toDeleteIds.length > 0) {
      await db.dairy_tray_transaction.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
    }

    if (data.length === 0) return;

    const values = Prisma.join(
      data.map(
        (d) =>
          Prisma.sql`(${d.dairy_tray_paper_id}, ${d.vehicle_id}, ${d.tray_type_id}, ${d.delivery_session}::"DeliverySession", ${d.opening_balance}, ${d.trays_taken}, ${d.trays_returned}, ${d.closing_balance}, now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO dairy_tray_transaction
      (dairy_tray_paper_id, vehicle_id, tray_type_id, delivery_session, opening_balance, trays_taken, trays_returned, closing_balance, updated_at)
    VALUES ${values}
    ON CONFLICT (dairy_tray_paper_id, delivery_session, vehicle_id, tray_type_id)
    DO UPDATE SET opening_balance = EXCLUDED.opening_balance,
                  trays_taken = EXCLUDED.trays_taken,
                  trays_returned = EXCLUDED.trays_returned,
                  closing_balance = EXCLUDED.closing_balance,
                  updated_at = EXCLUDED.updated_at
  `);
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
    if (entries.length === 0) return;

    const values = Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${dairyTrayPaperId}, ${e.vehicleId}, ${e.deliverySession}::"DeliverySession", ${e.trayTypeId}, ${e.returned})`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
    INSERT INTO dairy_tray_transaction
      (dairy_tray_paper_id, vehicle_id, delivery_session, tray_type_id, trays_returned, updated_at)
    VALUES ${Prisma.join(
      entries.map(
        (e) =>
          Prisma.sql`(${dairyTrayPaperId}, ${e.vehicleId}, ${e.deliverySession}::"DeliverySession", ${e.trayTypeId}, ${e.returned}, now())`,
      ),
    )}
    ON CONFLICT (dairy_tray_paper_id, delivery_session, vehicle_id, tray_type_id)
    DO UPDATE SET trays_returned = EXCLUDED.trays_returned,
                  updated_at = EXCLUDED.updated_at
  `);
  }

  async touchDairyTrayPaperIfUnchanged(
    dairyTrayPaperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    // NOTE: the original method passed `data: {}` — it never actually bumped
    // updated_at, unlike every other touch method in the codebase, which
    // looks like an oversight (the caller in dairy-trays.service.ts relies
    // on `assertNotStale` throwing on `count !== 1`, so the staleness check
    // itself still worked, but a *successful* save never advanced
    // updated_at, meaning a second save with the same expectedUpdatedAt
    // would incorrectly be treated as non-stale). Fixed to match every
    // other repository's behavior.
    return touchIfUnchanged(
      db.dairy_tray_paper,
      { id: dairyTrayPaperId },
      'updated_at',
      expectedUpdatedAt,
    );
  }
}
