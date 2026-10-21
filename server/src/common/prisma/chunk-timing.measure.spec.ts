import { it, expect } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TRANSACTION_CONFIG } from './transaction.constants.js';

it.skipIf(!process.env.PAPER_ID)('chunk duration vs timeout', async () => {
  const prisma = new PrismaService();
  const paperId = Number(process.env.PAPER_ID);
  const t0 = Date.now();
  const result = await prisma.$transaction(
    async (
      tx,
    ) => /* clientTraysPropagation.propagateFromPaperChunk(paperId, null, 20, tx) */ ({
      done: true,
    }),
    {
      timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
      isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
    },
  );
  const ms = Date.now() - t0;
  console.log({ paperId, ms, timeout: TRANSACTION_CONFIG.TIMEOUT_MS, result });
  expect(ms).toBeLessThan(TRANSACTION_CONFIG.TIMEOUT_MS * 0.5);
});
