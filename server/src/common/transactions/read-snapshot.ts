import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TRANSACTION_CONFIG } from './transaction.constants.js';

/** Read-only snapshot: never competes with writers the way Serializable can. */
export function runReadSnapshot<T>(
  prisma: PrismaService,
  read: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return prisma.$transaction(read, {
    maxWait: TRANSACTION_CONFIG.MAX_WAIT_MS,
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: options.timeoutMs ?? TRANSACTION_CONFIG.TIMEOUT_MS,
  });
}
