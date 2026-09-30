import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PROPAGATION_QUEUE } from './propagation-queue.constants.js';

export type ClientTraysForwardJob = {
  type: 'CLIENT_TRAYS_FORWARD';
  paperId: number;
  resumeFromSheetId?: number;
  outboxId: number;
};

export type ClientTraysCascadeFromSheetJob = {
  type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET';
  startSheetId: number;
  resumeFromSheetId?: number;
  outboxId: number;
};

export type DairyTraysForwardJob = {
  type: 'DAIRY_TRAYS_FORWARD';
  paperId: number;
  resumeFromPaperId?: number;
  outboxId: number;
};

export type PropagationJob =
  ClientTraysForwardJob | ClientTraysCascadeFromSheetJob | DairyTraysForwardJob;

const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

@Injectable()
export class PropagationQueueService {
  constructor(
    @InjectQueue(PROPAGATION_QUEUE)
    private readonly queue: Queue<PropagationJob>,
  ) {}

  async enqueueClientTraysForward(
    paperId: number,
    resumeFromSheetId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    await this.queue.add(
      'client-trays-forward',
      { type: 'CLIENT_TRAYS_FORWARD', paperId, resumeFromSheetId, outboxId },
      {
        ...JOB_OPTIONS,
        // FIX H3 (round 2 review): a deterministic jobId per (outbox row,
        // resume point) means BullMQ itself de-duplicates a genuinely
        // repeated enqueue of the same work (e.g. a relay retry racing a
        // processor's own continuation), on top of the DB-level
        // FOR UPDATE SKIP LOCKED fix in PropagationOutboxRepository.claimPending.
        jobId: `outbox-${outboxId}-ctf-${resumeFromSheetId ?? 'start'}`,
      },
    );
  }

  async enqueueClientTraysCascadeFromSheet(
    startSheetId: number,
    resumeFromSheetId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    await this.queue.add(
      'client-trays-cascade-from-sheet',
      {
        type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
        startSheetId,
        resumeFromSheetId,
        outboxId,
      },
      {
        ...JOB_OPTIONS,
        jobId: `outbox-${outboxId}-ctc-${resumeFromSheetId ?? 'start'}`,
      },
    );
  }

  async enqueueDairyTraysForward(
    paperId: number,
    resumeFromPaperId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    await this.queue.add(
      'dairy-trays-forward',
      { type: 'DAIRY_TRAYS_FORWARD', paperId, resumeFromPaperId, outboxId },
      {
        ...JOB_OPTIONS,
        jobId: `outbox-${outboxId}-dtf-${resumeFromPaperId ?? 'start'}`,
      },
    );
  }
}
