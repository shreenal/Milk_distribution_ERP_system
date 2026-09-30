import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PropagationOutboxRepository } from './propagation-outbox.repository.js';
import { PropagationQueueService } from './propagation-queue.service.js';
import {
  PROPAGATION_OUTBOX_MAX_ATTEMPTS,
  PROPAGATION_OUTBOX_RELAY_BATCH_SIZE,
  PROPAGATION_OUTBOX_RELAY_INTERVAL_MS,
  PROPAGATION_OUTBOX_STUCK_AFTER_MS,
  PROPAGATION_OUTBOX_TYPES,
} from './propagation-queue.constants.js';

/**
 * FIX C3 (production review): the only component in the system that talks
 * to BullMQ/Redis for propagation. It polls propagation_outbox for rows
 * written (atomically, inside business transactions — see
 * PropagationOutboxRepository.enqueue) by DependencyOrchestratorService,
 * and hands each one to BullMQ. If Redis is down, dispatch just fails and
 * retries on the next tick (or is marked FAILED after
 * PROPAGATION_OUTBOX_MAX_ATTEMPTS) — it never blocks or corrupts the
 * business transaction that originally recorded the row.
 */
@Injectable()
export class PropagationOutboxRelayService {
  private readonly logger = new Logger(PropagationOutboxRelayService.name);
  private running = false;

  constructor(
    private readonly outboxRepository: PropagationOutboxRepository,
    private readonly propagationQueueService: PropagationQueueService,
  ) {}

  @Interval(PROPAGATION_OUTBOX_RELAY_INTERVAL_MS)
  async relay(): Promise<void> {
    // Guard against overlapping ticks if a previous run is still working
    // through a large backlog when the next interval fires.
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const claimed = await this.outboxRepository.claimPending(
        PROPAGATION_OUTBOX_RELAY_BATCH_SIZE,
      );

      for (const row of claimed) {
        await this.dispatch(row);
      }
    } catch (error) {
      this.logger.error('Propagation outbox relay tick failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Recovers rows stuck in PROCESSING because the process crashed after
   * claiming them but before BullMQ accepted the job (or before the job's
   * completion handler marked them DONE). Runs far less often than the main
   * relay tick.
   */
  @Interval(PROPAGATION_OUTBOX_RELAY_INTERVAL_MS * 12)
  async requeueStuck(): Promise<void> {
    const count = await this.outboxRepository.requeueStuckProcessing(
      PROPAGATION_OUTBOX_STUCK_AFTER_MS,
    );

    if (count > 0) {
      this.logger.warn(
        `Requeued ${count} propagation outbox row(s) stuck in PROCESSING`,
      );
    }
  }

  private async dispatch(row: {
    id: number;
    type: string;
    paper_id: number;
    resume_from_id: number | null;
    attempts: number;
  }): Promise<void> {
    try {
      switch (row.type) {
        case PROPAGATION_OUTBOX_TYPES.CLIENT_TRAYS_FORWARD:
          await this.propagationQueueService.enqueueClientTraysForward(
            row.paper_id,
            row.resume_from_id ?? undefined,
            row.id,
          );
          break;

        case PROPAGATION_OUTBOX_TYPES.CLIENT_TRAYS_CASCADE_FROM_SHEET:
          if (row.resume_from_id === null) {
            throw new Error(
              `CLIENT_TRAYS_CASCADE_FROM_SHEET outbox row ${row.id} is missing resume_from_id (start sheet id)`,
            );
          }
          await this.propagationQueueService.enqueueClientTraysCascadeFromSheet(
            row.resume_from_id,
            undefined,
            row.id,
          );
          break;

        case PROPAGATION_OUTBOX_TYPES.DAIRY_TRAYS_FORWARD:
          await this.propagationQueueService.enqueueDairyTraysForward(
            row.paper_id,
            row.resume_from_id ?? undefined,
            row.id,
          );
          break;

        default:
          throw new Error(`Unknown propagation outbox type ${row.type}`);
      }
      // Dispatch to BullMQ succeeded. The row stays PROCESSING until the
      // BullMQ job itself marks it DONE (see PropagationQueueProcessor) —
      // that way a crash between "dispatched" and "processed" leaves the
      // row recoverable via requeueStuck rather than silently lost.
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Failed to dispatch propagation outbox row ${row.id} (attempt ${attempts}): ${message}`,
      );

      if (attempts >= PROPAGATION_OUTBOX_MAX_ATTEMPTS) {
        await this.outboxRepository.markFailed(row.id, message, attempts);
      } else {
        await this.outboxRepository.resetToPending(row.id, message, attempts);
      }
    }
  }
}
