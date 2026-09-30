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

/**
 * FIX C3 (production review): the transactional outbox for propagation
 * dispatch. `enqueue` is the write side and MUST be called with the same
 * `tx` as the business change that triggers it — that's what makes this a
 * fix rather than just another queue:
 *
 * - If the enclosing Serializable transaction is retried by
 *   withSerializableRetry after a 40001 conflict, this insert is rolled
 *   back along with everything else in that failed attempt, so a retried
 *   finalize can never record the same propagation intent twice.
 * - The business transaction no longer talks to Redis at all, so Redis
 *   being unavailable can no longer block paper finalize, order saves, etc.
 *   from committing. A separate relay (see propagation-outbox.relay.service.ts)
 *   picks up PENDING rows and is the only thing that talks to BullMQ.
 */
@Injectable()
export class PropagationOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    type: PropagationOutboxType,
    paperId: number,
    resumeFromId: number | null,
    tx: PrismaOrTransaction,
  ) {
    return tx.propagation_outbox.create({
      data: {
        type,
        paper_id: paperId,
        resume_from_id: resumeFromId,
      },
    });
  }

  /**
   * Relay-side: atomically claims up to `limit` PENDING rows by flipping
   * them to PROCESSING. The `updateMany` re-checks `status: PENDING` in its
   * WHERE clause, so if two relay instances race for the same row, only one
   * of them will actually flip it (Postgres row-level locking serializes
   * the two updateMany statements; whichever commits second sees the row is
   * no longer PENDING and simply doesn't affect it).
   */
  async claimPending(limit: number): Promise<PropagationOutboxRow[]> {
    return this.prisma.$queryRaw<PropagationOutboxRow[]>(Prisma.sql`
      UPDATE propagation_outbox
      SET status = ${PROPAGATION_OUTBOX_STATUS.PROCESSING}, updated_at = now()
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
