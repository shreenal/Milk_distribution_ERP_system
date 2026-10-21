// Real Postgres + real PrismaService (adapter-pg). No existing data needed:
// the spec creates its own throwaway master_bank rows and deletes them afterwards.
// master_bank is used because it has no foreign keys. The serialization error
// comes from Postgres / the driver adapter, so the table does not change its shape.
// Production code writes through the model API (update / updateMany), so that is
// exactly what is exercised here, not raw SQL.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { withSerializableRetry } from './with-serializable-retry.js';

const PREFIX = `__ser_probe_${Date.now()}`;

describe('real serialization-failure error shape', () => {
  const prisma = new PrismaService();
  let bankId: number;
  let rivalCounter = 0;

  beforeAll(async () => {
    const bank = await prisma.master_bank.create({
      data: { name: `${PREFIX}_base` },
    });
    bankId = bank.id;
  });

  afterAll(async () => {
    await prisma.master_bank.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    await prisma.$disconnect();
  });

  // Victim: Serializable tx reads the row (takes its snapshot), then a rival
  // commits a change to the same row on another connection, then the victim
  // writes -> Postgres must reject the victim's write with 40001.
  function victim(write: 'update' | 'updateMany') {
    return prisma.$transaction(
      async (tx) => {
        await tx.master_bank.findUniqueOrThrow({ where: { id: bankId } });

        await prisma.master_bank.update({
          where: { id: bankId },
          data: { name: `${PREFIX}_rival_${++rivalCounter}` },
        });

        if (write === 'update') {
          await tx.master_bank.update({
            where: { id: bankId },
            data: { is_active: false },
          });
        } else {
          await tx.master_bank.updateMany({
            where: { id: bankId },
            data: { is_active: false },
          });
        }
      },
      { isolationLevel: 'Serializable', timeout: 10000 },
    );
  }

  async function captureError(write: 'update' | 'updateMany'): Promise<any> {
    try {
      await victim(write);
    } catch (e) {
      return e;
    }
    throw new Error(
      'expected the victim transaction to fail, but it committed',
    );
  }

  for (const write of ['update', 'updateMany'] as const) {
    it(`real error from tx.${write}: shape + does withSerializableRetry recognise it`, async () => {
      const err = await captureError(write);
      console.log(`ERROR SHAPE (${write})`, {
        name: err?.name,
        constructor: err?.constructor?.name,
        code: err?.code,
        meta: err?.meta,
        message: String(err?.message).slice(0, 300),
      });

      // Replay the REAL captured error through the REAL withSerializableRetry:
      // 3 calls then ConflictException => recognised as a serialization failure.
      // 1 call and the raw error rethrown => NOT recognised (employee would get a 500).
      let calls = 0;
      const outcome = await withSerializableRetry(async () => {
        calls++;
        throw err;
      }).then(
        () => 'resolved' as const,
        (e) => e,
      );

      console.log(`REPLAY (${write})`, {
        calls,
        outcome:
          outcome instanceof ConflictException
            ? 'ConflictException(409)'
            : `raw ${outcome?.name}`,
      });
      expect(calls, 'retried 3 times => predicate matched').toBe(3);
      expect(outcome).toBeInstanceOf(ConflictException);
    });
  }

  it('end to end: a conflict that happens on every attempt ends as 409 after 3 attempts', async () => {
    let calls = 0;
    const outcome = await withSerializableRetry(() => {
      calls++;
      return victim('update');
    }).then(
      () => 'resolved' as const,
      (e) => e,
    );
    console.log('END TO END', {
      calls,
      outcome: outcome instanceof ConflictException ? '409' : outcome?.name,
    });
    expect(calls).toBe(3);
    expect(outcome).toBeInstanceOf(ConflictException);
  });
});
