import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PropagationOutboxRepository } from './propagation-outbox.repository.js';
import { PropagationQueueService } from './propagation-queue.service.js';
import {
  PROPAGATION_OUTBOX_DISPATCH_TIMEOUT_MS,
  PROPAGATION_OUTBOX_MAX_ATTEMPTS,
  PROPAGATION_OUTBOX_RELAY_BATCH_SIZE,
  PROPAGATION_OUTBOX_RELAY_INTERVAL_MS,
  PROPAGATION_OUTBOX_STUCK_AFTER_MS,
  PROPAGATION_OUTBOX_TYPES,
} from './propagation-queue.constants.js';

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
      await this.withTimeout(
        this.enqueueByType(row),
        PROPAGATION_OUTBOX_DISPATCH_TIMEOUT_MS,
        `Dispatch of outbox row ${row.id}`,
      );
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

  private withTimeout<T>(work: Promise<T>, ms: number, label: string) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(`${label} timed out after ${ms}ms (is Redis reachable?)`),
          ),
        ms,
      );
      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private async enqueueByType(row: {
    id: number;
    type: string;
    paper_id: number;
    resume_from_id: number | null;
  }): Promise<void> {
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
  }
}
