import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PropagationOutboxRepository } from './propagation-outbox.repository.js';
import { PropagationQueueService } from './propagation-queue.service.js';
import { PropagationOutboxRelayService } from './propagation-outbox.relay.service.js';
import { PropagationQueueProcessor } from './propagation-queue.processor.js';
import {
  PROPAGATION_QUEUE,
  PROPAGATION_OUTBOX_TYPES,
} from './propagation-queue.constants.js';

const connection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('FAILED outbox retry (observed sequence)', () => {
  const prisma = new PrismaService();
  const repo = new PropagationOutboxRepository(prisma);
  let queue: Queue, worker: Worker, relay: PropagationOutboxRelayService;
  let shouldFail = true;
  let executions = 0;
  const log: string[] = [];

  beforeAll(async () => {
    queue = new Queue(PROPAGATION_QUEUE, { connection });
    await queue.obliterate({ force: true });
    const qs = new PropagationQueueService(queue as any);
    relay = new PropagationOutboxRelayService(repo, qs);

    const failingClient = {
      propagateFromPaperChunk: async () => {
        executions++;
        if (shouldFail) throw new Error('forced failure');
        return { done: true };
      },
    };
    const processor = new PropagationQueueProcessor(
      failingClient as any,
      {} as any,
      qs,
      repo,
      {
        $transaction: (fn: any) => fn({}),
      } as any,
    );

    worker = new Worker(PROPAGATION_QUEUE, (job) => processor.process(job), {
      connection,
    });
    worker.on('failed', (job, err) => void processor.onJobFailed(job, err));
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
  });

  const status = async (id: number) =>
    (await prisma.propagation_outbox.findUniqueOrThrow({ where: { id } }))
      .status;

  it('records what actually happens on retry', async () => {
    const row = await prisma.propagation_outbox.create({
      data: {
        type: PROPAGATION_OUTBOX_TYPES.CLIENT_TRAYS_FORWARD,
        paper_id: 999001,
      },
    });

    await relay.relay();
    // 5 attempts, exponential backoff from 2s => ~30s
    for (let i = 0; i < 50 && (await status(row.id)) !== 'FAILED'; i++)
      await sleep(1000);
    log.push(
      `1. after failure: outbox=${await status(row.id)}, executions=${executions}`,
    );
    expect(await status(row.id)).toBe('FAILED');

    const jobId = `outbox-${row.id}-ctf-start`;
    log.push(
      `2. old job record state: ${await (await queue.getJob(jobId))?.getState()}`,
    );

    // The real admin retry path:
    shouldFail = false;
    const before = executions;
    await repo.requeueFailedForPaper(999001);
    log.push(`3. after requeue: outbox=${await status(row.id)}`);
    await relay.relay();
    await sleep(5000);
    log.push(
      `4. after relay: outbox=${await status(row.id)}, new executions=${executions - before}`,
    );

    // Does requeueStuck change anything? Age the row past the stuck threshold.
    await prisma.$executeRaw`UPDATE propagation_outbox SET updated_at = now() - interval '5 minutes' WHERE id = ${row.id} AND status = 'PROCESSING'`;
    await repo.requeueStuckProcessing(2 * 60 * 1000);
    log.push(`5. after requeueStuck: outbox=${await status(row.id)}`);
    await relay.relay();
    await sleep(5000);
    log.push(
      `6. final: outbox=${await status(row.id)}, total new executions=${executions - before}`,
    );

    console.log('\n' + log.join('\n'));
    // Assertion encodes the OBSERVED outcome you want to prove or disprove:
    expect(executions - before, 'retry re-executed the job').toBeGreaterThan(0);
  }, 120_000);
});
