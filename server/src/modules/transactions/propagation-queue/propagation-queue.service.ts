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
    await this.addJob(
      'client-trays-forward',
      { type: 'CLIENT_TRAYS_FORWARD', paperId, resumeFromSheetId, outboxId },
      `outbox-${outboxId}-ctf-${resumeFromSheetId ?? 'start'}`,
    );
  }

  async enqueueClientTraysCascadeFromSheet(
    startSheetId: number,
    resumeFromSheetId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    await this.addJob(
      'client-trays-cascade-from-sheet',
      {
        type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
        startSheetId,
        resumeFromSheetId,
        outboxId,
      },
      `outbox-${outboxId}-ctc-${resumeFromSheetId ?? 'start'}`,
    );
  }

  async enqueueDairyTraysForward(
    paperId: number,
    resumeFromPaperId: number | undefined,
    outboxId: number,
  ): Promise<void> {
    await this.addJob(
      'dairy-trays-forward',
      { type: 'DAIRY_TRAYS_FORWARD', paperId, resumeFromPaperId, outboxId },
      `outbox-${outboxId}-dtf-${resumeFromPaperId ?? 'start'}`,
    );
  }

  private async addJob(
    name: string,
    data: PropagationJob,
    jobId: string,
  ): Promise<void> {
    const existing = await this.queue.getJob(jobId);
    if (
      existing &&
      ((await existing.isFailed()) || (await existing.isCompleted()))
    ) {
      await existing.remove();
    }
    await this.queue.add(name, data, { ...JOB_OPTIONS, jobId });
  }
}
