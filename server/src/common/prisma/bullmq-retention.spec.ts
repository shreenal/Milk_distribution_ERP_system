// Needs only Redis. Uses the exact JOB_OPTIONS from propagation-queue.service.ts.
import { describe, it, expect, afterAll } from 'vitest';
import { Queue, Worker } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
};
const OPTS = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 100 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('deterministic jobId vs retention', () => {
  const q = new Queue('retention-test', { connection });
  let runs = 0,
    fail = true;
  const w = new Worker(
    'retention-test',
    async () => {
      runs++;
      if (fail) throw new Error('x');
    },
    { connection },
  );
  afterAll(async () => {
    await w.close();
    await q.close();
  });

  it('duplicate add of a retained FAILED job does not run', async () => {
    await q.obliterate({ force: true });
    await q.add('x', {}, { ...OPTS, jobId: 'a' });
    await sleep(1500);
    const before = runs;
    fail = false;
    await q.add('x', {}, { ...OPTS, jobId: 'a' });
    await sleep(1000);
    expect(runs - before).toBe(0);
  });

  it('retention is COUNT based: oldest failed job is evicted after 500 newer failures', async () => {
    await q.obliterate({ force: true });
    fail = true;
    await q.add('x', {}, { ...OPTS, attempts: 1, jobId: 'first' });
    for (let i = 0; i < 505; i++)
      await q.add('x', {}, { ...OPTS, attempts: 1, jobId: `f${i}` });
    for (let i = 0; i < 60 && (await q.getFailedCount()) < 500; i++)
      await sleep(500);
    await sleep(2000);
    expect(await q.getJob('first')).toBeUndefined();
    fail = false;
    const before = runs;
    await q.add('x', {}, { ...OPTS, jobId: 'first' });
    await sleep(1000);
    expect(runs - before).toBe(1); // after eviction the same id runs again
  }, 120_000);

  it('default worker concurrency', () => {
    expect(w.opts.concurrency).toBe(1);
  });
});
