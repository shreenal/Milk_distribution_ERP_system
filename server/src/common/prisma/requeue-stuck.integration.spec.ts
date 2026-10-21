// Postgres only (no Redis). Put next to propagation-outbox.repository.ts.
// Creates its own outbox rows (paper_id 999002) and deletes them afterwards.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PropagationOutboxRepository } from '../../modules/transactions/propagation-queue/propagation-outbox.repository.js';

const PAPER_ID = 999002;
const STUCK_AFTER_MS = 120_000;

describe('requeueStuckProcessing (real DB)', () => {
  const prisma = new PrismaService();
  const repo = new PropagationOutboxRepository(prisma);
  const ids: Record<string, number> = {};

  // Explicit Date from the app clock (UTC). Do NOT age rows with raw SQL now():
  // raw now() writes the DB session's local wall-clock into a timestamp-without-tz
  // column, which Prisma then reads back as UTC.
  const age = (id: number, minutes: number) =>
    prisma.propagation_outbox.update({
      where: { id },
      data: { updated_at: new Date(Date.now() - minutes * 60_000) },
    });

  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(ids).map(async ([k, id]) => {
          const r = await prisma.propagation_outbox.findUniqueOrThrow({
            where: { id },
          });
          return [
            k,
            { status: r.status, updated_at: r.updated_at.toISOString() },
          ];
        }),
      ),
    );

  beforeAll(async () => {
    await prisma.propagation_outbox.deleteMany({
      where: { paper_id: PAPER_ID },
    });
    const mk = async (key: string, status: string) => {
      const row = await prisma.propagation_outbox.create({
        data: { type: 'CLIENT_TRAYS_FORWARD', paper_id: PAPER_ID, status },
      });
      ids[key] = row.id;
    };
    await mk('processingFresh', 'PROCESSING');
    await mk('processingStuck', 'PROCESSING');
    await mk('pendingOld', 'PENDING');
    await mk('doneOld', 'DONE');
    await mk('failedOld', 'FAILED');

    // @updatedAt stamps "now" on create, so age rows with raw SQL.
    await age(ids.processingStuck, 10);
    await age(ids.pendingOld, 10);
    await age(ids.doneOld, 10);
    await age(ids.failedOld, 10);
  });

  afterAll(async () => {
    await prisma.propagation_outbox.deleteMany({
      where: { paper_id: PAPER_ID },
    });
    await prisma.$disconnect();
  });

  it('requeues only PROCESSING rows older than the cutoff', async () => {
    const before = await snapshot();
    const count = await repo.requeueStuckProcessing(STUCK_AFTER_MS);
    const after = await snapshot();

    console.log('BEFORE', before);
    console.log('RETURNED COUNT (may include other rows in the DB)', count);
    console.log('AFTER', after);

    expect(
      after.processingStuck.status,
      'aged PROCESSING row should flip to PENDING',
    ).toBe('PENDING');
    expect(
      after.processingFresh.status,
      'recent PROCESSING row must be left alone',
    ).toBe('PROCESSING');
    expect(after.pendingOld.status).toBe('PENDING');
    expect(after.doneOld.status).toBe('DONE');
    expect(after.failedOld.status).toBe('FAILED');
    expect(count).toBeGreaterThanOrEqual(1);

    // Informational: does Prisma's @updatedAt bump updated_at on this updateMany?
    const bumped =
      new Date(after.processingStuck.updated_at) >
      new Date(before.processingStuck.updated_at);
    console.log('updated_at bumped by updateMany (@updatedAt):', bumped);
  });

  // claimPending sets updated_at with raw SQL now(). If the DB session timezone
  // is not UTC, the stored value is shifted vs. the app clock, which would skew
  // every "stuck" calculation. Run this against a TEST db: it claims any PENDING rows.
  it('claimPending stamps updated_at consistent with the app clock', async () => {
    const row = await prisma.propagation_outbox.create({
      data: {
        type: 'CLIENT_TRAYS_FORWARD',
        paper_id: PAPER_ID,
        status: 'PENDING',
      },
    });
    await repo.claimPending(1000);
    const after = await prisma.propagation_outbox.findUniqueOrThrow({
      where: { id: row.id },
    });
    const driftMs = after.updated_at.getTime() - Date.now();
    console.log(
      'CLAIM STATUS',
      after.status,
      'updated_at',
      after.updated_at.toISOString(),
      'drift vs app clock (ms)',
      driftMs,
    );
    expect(after.status).toBe('PROCESSING');
    expect(Math.abs(driftMs), 'DB now() vs app clock drift').toBeLessThan(
      60_000,
    );
  });
});
