import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import {
  PropagationOutboxType,
  PROPAGATION_OUTBOX_STATUS,
} from './propagation-queue.constants.js';
import { Prisma } from '../../../generated/prisma/client.js';

type PropagationOutboxRow = {
  id: number;
  type: string;
  paper_id: number;
  resume_from_id: number | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class PropagationOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    type: PropagationOutboxType,
    paperId: number,
    resumeFromId: number | null,
    tx: PrismaOrTransaction,
  ) {
    const pending = await tx.propagation_outbox.findFirst({
      where: {
        type,
        paper_id: paperId,
        resume_from_id: resumeFromId,
        status: PROPAGATION_OUTBOX_STATUS.PENDING,
      },
    });
    if (pending) return pending; // a PENDING cascade hasn't started; it will read the latest data
    return tx.propagation_outbox.create({
      data: {
        type,
        paper_id: paperId,
        resume_from_id: resumeFromId,
      },
    });
  }

  async claimPending(limit: number): Promise<PropagationOutboxRow[]> {
    return this.prisma.$queryRaw<PropagationOutboxRow[]>(Prisma.sql`
      UPDATE propagation_outbox
      SET status = ${PROPAGATION_OUTBOX_STATUS.PROCESSING}, updated_at = (now() AT TIME ZONE 'UTC')
      WHERE id IN (
        SELECT id FROM propagation_outbox
        WHERE status = ${PROPAGATION_OUTBOX_STATUS.PENDING}
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `);
  }

  /**
   * PA-10.7: a newer job for the same paper, type and resume point that
   * completed supersedes older FAILED rows of that key. They become DISMISSED
   * (kept for the record) so a failure that a later run already fixed stops
   * blocking the next finalize (PA-8.4).
   */
  async markDone(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.propagation_outbox.update({
        where: { id },
        data: { status: PROPAGATION_OUTBOX_STATUS.DONE },
      });

      await tx.propagation_outbox.updateMany({
        where: {
          paper_id: done.paper_id,
          type: done.type,
          resume_from_id: done.resume_from_id,
          status: PROPAGATION_OUTBOX_STATUS.FAILED,
          id: { lt: done.id },
        },
        data: { status: PROPAGATION_OUTBOX_STATUS.DISMISSED },
      });

      return done;
    });
  }

  async markFailed(id: number, error: string, attempts: number) {
    return this.prisma.propagation_outbox.update({
      where: { id },
      data: {
        status: PROPAGATION_OUTBOX_STATUS.FAILED,
        last_error: error.slice(0, 2000),
        attempts,
      },
    });
  }

  async resetToPending(id: number, error: string, attempts: number) {
    return this.prisma.propagation_outbox.update({
      where: { id },
      data: {
        status: PROPAGATION_OUTBOX_STATUS.PENDING,
        last_error: error.slice(0, 2000),
        attempts,
      },
    });
  }

  async touchProcessing(id: number): Promise<void> {
    await this.prisma.propagation_outbox.updateMany({
      where: { id, status: PROPAGATION_OUTBOX_STATUS.PROCESSING },
      data: { updated_at: new Date() },
    });
  }

  async summarizeForPaper(paperId: number) {
    const [counts, failures] = await Promise.all([
      this.prisma.propagation_outbox.groupBy({
        by: ['status'],
        where: { paper_id: paperId },
        _count: { _all: true },
      }),
      this.prisma.propagation_outbox.findMany({
        where: {
          paper_id: paperId,
          status: PROPAGATION_OUTBOX_STATUS.FAILED,
        },
        select: {
          id: true,
          type: true,
          attempts: true,
          last_error: true,
          updated_at: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    const count = (status: string) =>
      counts.find((c) => c.status === status)?._count._all ?? 0;

    const pending = count(PROPAGATION_OUTBOX_STATUS.PENDING);
    const processing = count(PROPAGATION_OUTBOX_STATUS.PROCESSING);
    const failed = count(PROPAGATION_OUTBOX_STATUS.FAILED);
    const done = count(PROPAGATION_OUTBOX_STATUS.DONE);
    const dismissed = count(PROPAGATION_OUTBOX_STATUS.DISMISSED);

    const status: 'COMPLETE' | 'IN_PROGRESS' | 'FAILED' =
      failed > 0
        ? 'FAILED'
        : pending + processing > 0
          ? 'IN_PROGRESS'
          : 'COMPLETE';

    return { status, pending, processing, failed, done, dismissed, failures };
  }

  /** FAILED rows plus rows stuck PENDING/PROCESSING, across all papers. */
  async listProblems(stuckAfterMs: number) {
    const cutoff = new Date(Date.now() - stuckAfterMs);

    return this.prisma.propagation_outbox.findMany({
      where: {
        OR: [
          { status: PROPAGATION_OUTBOX_STATUS.FAILED },
          {
            status: {
              in: [
                PROPAGATION_OUTBOX_STATUS.PENDING,
                PROPAGATION_OUTBOX_STATUS.PROCESSING,
              ],
            },
            updated_at: { lt: cutoff },
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: 200,
    });
  }

  // PA-10.4: the row starts over, so the error of the failed run is cleared.
  async requeueFailedForPaper(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ): Promise<number> {
    const result = await db.propagation_outbox.updateMany({
      where: { paper_id: paperId, status: PROPAGATION_OUTBOX_STATUS.FAILED },
      data: {
        status: PROPAGATION_OUTBOX_STATUS.PENDING,
        attempts: 0,
        last_error: null,
      },
    });

    return result.count;
  }

  /**
   * PA-10.6: an admin gives up on FAILED rows. They stay in the table with
   * status DISMISSED (evidence), so they stop blocking the next finalize.
   * Returns the rows that were dismissed.
   */
  async dismissFailedForPaper(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const rows = await db.propagation_outbox.findMany({
      where: { paper_id: paperId, status: PROPAGATION_OUTBOX_STATUS.FAILED },
      select: { id: true, type: true, last_error: true },
      orderBy: { id: 'asc' },
    });

    if (rows.length === 0) return rows;

    await db.propagation_outbox.updateMany({
      where: {
        id: { in: rows.map((r) => r.id) },
        status: PROPAGATION_OUTBOX_STATUS.FAILED,
      },
      data: { status: PROPAGATION_OUTBOX_STATUS.DISMISSED },
    });

    return rows;
  }

  async requeueStuckProcessing(stuckSinceMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - stuckSinceMs);

    const result = await this.prisma.propagation_outbox.updateMany({
      where: {
        status: PROPAGATION_OUTBOX_STATUS.PROCESSING,
        updated_at: { lt: cutoff },
      },
      data: { status: PROPAGATION_OUTBOX_STATUS.PENDING },
    });

    return result.count;
  }
}
