import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

import { isTransactionTimeout } from './db-errors.js';
import { withSerializableRetry } from './with-serializable-retry.js';
import {
  DEFAULT_TRANSACTION_OPTIONS,
  type TransactionOptions,
} from './transaction-options.js';
import {
  TRANSACTION_CONFIG,
  TRANSACTION_TIMED_OUT_MESSAGE,
} from './transaction.constants.js';

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  try {
    return await withSerializableRetry(() =>
      prisma.$transaction(operation, {
        maxWait: TRANSACTION_CONFIG.MAX_WAIT_MS,
        timeout: options.timeoutMs ?? DEFAULT_TRANSACTION_OPTIONS.timeoutMs,
        isolationLevel:
          options.isolationLevel ?? DEFAULT_TRANSACTION_OPTIONS.isolationLevel,
      }),
    );
  } catch (err: unknown) {
    // A transaction that hit its limit saved nothing: retryable, not a 500.
    if (isTransactionTimeout(err)) {
      throw new ConflictException(TRANSACTION_TIMED_OUT_MESSAGE);
    }
    throw err;
  }
}
