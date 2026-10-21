import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { PROPAGATION_QUEUE } from './propagation-queue.constants.js';
import {
  PropagationJob,
  PropagationQueueService,
} from './propagation-queue.service.js';
import { PropagationOutboxRepository } from './propagation-outbox.repository.js';
import { ClientTraysPropagationService } from '../client-trays/services/client-trays-propagation.service.js';
import { DairyTraysPropagationService } from '../dairy-trays/services/dairy-trays-propagation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';

const CHUNK_SIZE = 20;
const MAX_REPORTED_DETAILS = 25;

// CT-6.6: a conflict's `details` (date, client, tray, returned, outstanding)
// must reach propagation_outbox.last_error, not only the generic message.
function describeHttpFailure(error: HttpException): string {
  const body = error.getResponse();
  const details =
    typeof body === 'object' &&
    body !== null &&
    'details' in body &&
    Array.isArray(body.details)
      ? body.details.map(String)
      : [];

  if (details.length === 0) return error.message;

  const shown = details.slice(0, MAX_REPORTED_DETAILS).join('; ');
  const more =
    details.length > MAX_REPORTED_DETAILS
      ? `; ...and ${details.length - MAX_REPORTED_DETAILS} more`
      : '';
  return `${error.message}: ${shown}${more}`;
}

@Processor(PROPAGATION_QUEUE)
export class PropagationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(PropagationQueueProcessor.name);

  constructor(
    private readonly clientTraysPropagationService: ClientTraysPropagationService,
    private readonly dairyTraysPropagationService: DairyTraysPropagationService,
    private readonly propagationQueueService: PropagationQueueService,
    private readonly outboxRepository: PropagationOutboxRepository,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<PropagationJob>): Promise<void> {
    try {
      await this.run(job);
    } catch (error) {
      // Business-rule failures (409 return conflict, 404 missing sheet) are
      // deterministic: retrying cannot succeed. Fail now, with the details.
      if (error instanceof HttpException) {
        throw new UnrecoverableError(describeHttpFailure(error));
      }
      throw error; // P2034, connection errors etc. keep BullMQ's retry/backoff
    }
  }

  private async run(job: Job<PropagationJob>): Promise<void> {
    if (job.data.type === 'CLIENT_TRAYS_FORWARD') {
      await this.processClientTraysForward(
        job.data.paperId,
        job.data.resumeFromSheetId,
        job.data.outboxId,
      );
      return;
    }

    if (job.data.type === 'CLIENT_TRAYS_CASCADE_FROM_SHEET') {
      await this.processClientTraysCascade(
        job.data.startSheetId,
        job.data.resumeFromSheetId,
        job.data.outboxId,
      );
      return;
    }

    await this.processDairyTraysForward(
      job.data.paperId,
      job.data.resumeFromPaperId,
      job.data.outboxId,
    );
  }

  @OnWorkerEvent('failed')
  async onJobFailed(
    job: Job<PropagationJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    const maxAttempts =
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;

    const isFinal =
      error instanceof UnrecoverableError || job.attemptsMade >= maxAttempts;

    if (!isFinal) {
      // Not the final attempt: BullMQ will retry this job itself.
      return;
    }

    this.logger.error(
      `Propagation job ${job.id} (outbox row ${job.data.outboxId}) exhausted ${job.attemptsMade} attempts: ${error.message}`,
    );

    await this.outboxRepository.markFailed(
      job.data.outboxId,
      error.message,
      job.attemptsMade,
    );
  }

  private async processClientTraysForward(
    paperId: number,
    resumeFromSheetId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    const result = await this.prisma.$transaction(
      (tx) =>
        this.clientTraysPropagationService.propagateFromPaperChunk(
          paperId,
          resumeFromSheetId ?? null,
          CHUNK_SIZE,
          tx,
        ),
      {
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
        isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
      },
    );

    if (!result.done) {
      this.logger.log(
        `Client trays forward propagation for paper ${paperId} truncated at ${result.resumeFromSheetId}, requeueing`,
      );
      await this.outboxRepository.touchProcessing(outboxId);
      await this.propagationQueueService.enqueueClientTraysForward(
        paperId,
        result.resumeFromSheetId,
        outboxId,
      );
      return;
    }

    await this.outboxRepository.markDone(outboxId);
  }

  private async processClientTraysCascade(
    startSheetId: number,
    resumeFromSheetId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    const result = await this.prisma.$transaction(
      (tx) =>
        this.clientTraysPropagationService.cascadeForwardChunk(
          startSheetId,
          resumeFromSheetId ?? null,
          CHUNK_SIZE,
          tx,
        ),
      {
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
        isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
      },
    );

    if (!result.done) {
      this.logger.log(
        `Client trays cascade from sheet ${startSheetId} truncated at ${result.resumeFromSheetId}, requeueing`,
      );
      await this.outboxRepository.touchProcessing(outboxId);
      await this.propagationQueueService.enqueueClientTraysCascadeFromSheet(
        startSheetId,
        result.resumeFromSheetId,
        outboxId,
      );
      return;
    }

    await this.outboxRepository.markDone(outboxId);
  }

  private async processDairyTraysForward(
    paperId: number,
    resumeFromPaperId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    const result = await this.prisma.$transaction(
      (tx) =>
        this.dairyTraysPropagationService.propagateFromPaperChunk(
          paperId,
          resumeFromPaperId ?? null,
          CHUNK_SIZE,
          tx,
        ),
      {
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
        isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
      },
    );

    if (!result.done) {
      this.logger.log(
        `Dairy trays forward propagation for paper ${paperId} truncated at ${result.resumeFromPaperId}, requeueing`,
      );
      await this.outboxRepository.touchProcessing(outboxId);
      await this.propagationQueueService.enqueueDairyTraysForward(
        paperId,
        result.resumeFromPaperId,
        outboxId,
      );
      return;
    }

    await this.outboxRepository.markDone(outboxId);
  }
}
