import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { touchIfTokenMatches } from '../../../common/prisma/touch-if-unchanged.util.js';
import { buildDairyTrayKey } from './dairy-trays.util.js';

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

  // DT-8.3: inactive tray types with open balances stay visible, so the grid
  // needs every tray type, not only the active ones. The builder marks the
  // inactive ones read-only.
  async getAllTrayTypes(db: PrismaOrTransaction = this.prisma) {
    return db.master_tray_type.findMany({
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

  // DT-8.2 / DT-8.4: vehicles are looked up by id regardless of is_active,
  // so an outstanding balance never loses its vehicle.
  async getVehiclesByIds(
    vehicleIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (vehicleIds.length === 0) return [];

    return db.master_vehicle.findMany({
      where: { id: { in: vehicleIds } },
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

  /**
   * Opening balances for a paper, keyed by (vehicle, session, tray type).
   *
   * DT-6.3: for each key, the most recent EARLIER stored closing wins, even
   * when the immediately previous paper has no row for it (a gap). Only
   * non-zero closings carry; a key whose latest closing is 0 has nothing
   * outstanding.
   */
  async getOpeningBalances(
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ): Promise<Map<string, number>> {
    const balances = new Map<string, number>();

    // Newest paper first, so `distinct` keeps the latest row for each key.
    const rows = await db.dairy_tray_transaction.findMany({
      where: {
        dairy_tray_paper: {
          order_paper: { sale_date: { lt: saleDate } },
        },
      },
      orderBy: {
        dairy_tray_paper: { order_paper: { sale_date: 'desc' } },
      },
      distinct: ['vehicle_id', 'delivery_session', 'tray_type_id'],
      select: {
        vehicle_id: true,
        delivery_session: true,
        tray_type_id: true,
        closing_balance: true,
      },
    });

    for (const row of rows) {
      const closing = Number(row.closing_balance ?? 0);

      if (closing !== 0) {
        balances.set(
          buildDairyTrayKey({
            vehicleId: row.vehicle_id,
            deliverySession: row.delivery_session,
            trayTypeId: row.tray_type_id,
          }),
          closing,
        );
      }
    }

    return balances;
  }

  /**
   * Makes the paper's stored ledger exactly equal to `data`.
   *
   * DT-7.3: rows that are no longer part of the calculated ledger are deleted,
   * even when `data` is empty. Deletion is restricted to this paper. Callers
   * must have refused any change that would delete a row holding a positive
   * return (DT-7.2) before calling this.
   */
  async replaceTrayTransactions(
    dairyTrayPaperId: number,
    data: Prisma.dairy_tray_transactionCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
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
        where: {
          dairy_tray_paper_id: dairyTrayPaperId,
          id: { in: toDeleteIds },
        },
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

  async findPapersBySaleDateRange(
    from: Date,
    to: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findMany({
      where: { sale_date: { gte: from, lte: to } },
      select: { id: true, sale_date: true },
      orderBy: { sale_date: 'asc' },
    });
  }

  // DT-9: compare-and-advance on the header's token. The caller must not pass
  // a null token (the header always has one), see DairyTraysService.
  async touchDairyTrayPaperIfTokenMatches(
    dairyTrayPaperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
      db.dairy_tray_paper,
      { id: dairyTrayPaperId },
      'updated_at',
      expectedUpdatedAt,
    );
  }

  // DT-9.6: advances the token when a recalculation or cascade actually
  // changed stored dairy tray rows. Uses the same clock-safe helper, so the
  // new token is always strictly later than the old one.
  async advanceDairyTrayPaperToken(
    dairyTrayPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const header = await db.dairy_tray_paper.findUniqueOrThrow({
      where: { id: dairyTrayPaperId },
      select: { updated_at: true },
    });

    return touchIfTokenMatches(
      db.dairy_tray_paper,
      { id: dairyTrayPaperId },
      'updated_at',
      header.updated_at,
    );
  }
}
