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

  async markDone(id: number) {
    return this.prisma.propagation_outbox.update({
      where: { id },
      data: { status: PROPAGATION_OUTBOX_STATUS.DONE },
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

    const status: 'COMPLETE' | 'IN_PROGRESS' | 'FAILED' =
      failed > 0
        ? 'FAILED'
        : pending + processing > 0
          ? 'IN_PROGRESS'
          : 'COMPLETE';

    return { status, pending, processing, failed, done, failures };
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

  async requeueFailedForPaper(paperId: number): Promise<number> {
    const result = await this.prisma.propagation_outbox.updateMany({
      where: { paper_id: paperId, status: PROPAGATION_OUTBOX_STATUS.FAILED },
      data: { status: PROPAGATION_OUTBOX_STATUS.PENDING, attempts: 0 },
    });

    return result.count;
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
