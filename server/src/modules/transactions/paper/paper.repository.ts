import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  DeliverySession,
  OrderPaperStatus,
  PaperAuditAction,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { PROPAGATION_OUTBOX_STATUS } from '../propagation-queue/propagation-queue.constants.js';
import { PAPER_AUDIT_LIST_LIMIT } from './paper.constants.js';

export const PAPER_LIST_DEFAULT_PAGE_SIZE = 50;
export const PAPER_LIST_MAX_PAGE_SIZE = 200;

// PA-20: one audit entry per Paper action.
export type PaperAuditEntry = {
  paperId: number;
  action: PaperAuditAction;
  userId: number;
  fromStatus?: OrderPaperStatus | null;
  toStatus?: OrderPaperStatus | null;
  reason?: string | null;
  details?: Prisma.InputJsonValue;
};

@Injectable()
export class PaperRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPapers(
    page = 1,
    pageSize = PAPER_LIST_DEFAULT_PAGE_SIZE,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const take = Math.min(Math.max(pageSize, 1), PAPER_LIST_MAX_PAGE_SIZE);
    const skip = (Math.max(page, 1) - 1) * take;

    const [papers, total] = await Promise.all([
      db.order_paper.findMany({
        orderBy: { sale_date: 'desc' },
        take,
        skip,
      }),
      db.order_paper.count(),
    ]);

    return { papers, total, page: Math.max(page, 1), pageSize: take };
  }

  async findPaperBySaleDate(
    today: Date,
    tomorrow: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findFirst({
      where: {
        sale_date: {
          gte: today,
          lt: tomorrow,
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
              },
            },
          },

          orderBy: {
            id: 'asc',
          },
        },
      },
    });
  }

  async findPreviousPaper(
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findFirst({
      where: { sale_date: { lt: saleDate } },
      orderBy: { sale_date: 'desc' },
      select: { id: true, status: true, sale_date: true },
    });
  }

  // PA-8.4: failed background propagation rows of one paper. DISMISSED rows
  // (PA-10.6) are not FAILED and never block.
  async countFailedPropagations(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.propagation_outbox.count({
      where: {
        paper_id: paperId,
        status: PROPAGATION_OUTBOX_STATUS.FAILED,
      },
    });
  }

  async findPaperById(paperId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_paper.findUnique({
      where: {
        id: paperId,
      },

      include: {
        order_sheet: {
          include: {
            master_group: {
              select: {
                id: true,
                name: true,
                delivery_session: true,
              },
            },
          },

          orderBy: {
            id: 'asc',
          },
        },
      },
    });
  }

  // PA-6.5 / PA-7.5 / PA-17: the readiness checks need to know whether a
  // sheet's group is still active, whether the sheet is marked no-operation
  // (a scalar on the sheet) and whether it has any order line at all.
  async getPaperSheets(paperId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_sheet.findMany({
      where: {
        order_paper_id: paperId,
      },

      include: {
        master_group: {
          select: {
            id: true,
            name: true,
            delivery_session: true,
            is_active: true,
          },
        },
        _count: { select: { order_sheet_items: true } },
      },

      orderBy: {
        id: 'asc',
      },
    });
  }

  async getActiveGroups(db: PrismaOrTransaction = this.prisma) {
    return db.master_group.findMany({
      where: {
        is_active: true,
      },
    });
  }

  // Both dates are passed in, so the sale-date offset has one source (the
  // service), not a second hardcoded +1 here.
  async createPaper(
    orderDate: Date,
    saleDate: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.create({
      data: {
        order_date: orderDate,

        sale_date: saleDate,

        status: OrderPaperStatus.DRAFT,
      },
    });
  }

  async generateOrderSheets(
    paperId: number,
    groups: { id: number; delivery_session: DeliverySession }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.createMany({
      data: groups.map((group) => ({
        order_paper_id: paperId,

        group_id: group.id,
        delivery_session: group.delivery_session,
      })),
      skipDuplicates: true,
    });
  }

  async submitNightEntry(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.update({
      where: {
        id: paperId,
      },

      data: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,

        night_entry_submitted_at: new Date(),
      },
    });
  }

  async submitMorningEntry(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.update({
      where: {
        id: paperId,
      },

      data: {
        status: OrderPaperStatus.MORNING_SUBMITTED,

        morning_entry_submitted_at: new Date(),
      },
    });
  }

  // PA-18: the morning submit left nothing behind except the status and its
  // timestamp, so undoing it clears exactly those. The audit log keeps the
  // history.
  async revertMorningSubmit(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.update({
      where: {
        id: paperId,
      },

      data: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,

        morning_entry_submitted_at: null,
      },
    });
  }

  async finalizePaper(paperId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_paper.update({
      where: {
        id: paperId,
      },

      data: {
        status: OrderPaperStatus.FINALIZED,

        finalized_at: new Date(),
      },
    });
  }

  async reopenPaper(
    paperId: number,
    reason: string,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.update({
      where: {
        id: paperId,
      },

      data: {
        status: OrderPaperStatus.REOPENED,

        reopened_at: new Date(),

        reopen_reason: reason,
      },
    });
  }

  // ---------------------------------------------------------------------
  // PA-17: no-operation routes
  // ---------------------------------------------------------------------

  async findSheetIdsInPaper(
    paperId: number,
    sheetIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.findMany({
      where: { order_paper_id: paperId, id: { in: sheetIds } },
      select: { id: true },
    });
  }

  /** Returns how many sheets actually changed (already-correct ones are skipped). */
  async setSheetsNoOperation(
    paperId: number,
    sheetIds: number[],
    noOperation: boolean,
    db: PrismaOrTransaction = this.prisma,
  ): Promise<number> {
    const result = await db.order_sheet.updateMany({
      where: {
        order_paper_id: paperId,
        id: { in: sheetIds },
        no_operation: !noOperation,
      },
      data: { no_operation: noOperation },
    });

    return result.count;
  }

  // ---------------------------------------------------------------------
  // PA-20: audit
  // ---------------------------------------------------------------------

  async createAuditLog(
    entry: PaperAuditEntry,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.paper_audit_log.create({
      data: {
        order_paper_id: entry.paperId,
        action: entry.action,
        user_id: entry.userId,
        from_status: entry.fromStatus ?? null,
        to_status: entry.toStatus ?? null,
        reason: entry.reason ?? null,
        details: entry.details,
      },
    });
  }

  async listAuditLog(paperId: number, db: PrismaOrTransaction = this.prisma) {
    return db.paper_audit_log.findMany({
      where: { order_paper_id: paperId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { id: 'desc' },
      take: PAPER_AUDIT_LIST_LIMIT,
    });
  }
}
