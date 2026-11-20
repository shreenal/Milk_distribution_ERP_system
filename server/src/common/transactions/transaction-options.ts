import { Prisma } from '../../generated/prisma/client.js';
import { TRANSACTION_CONFIG } from './transaction.constants.js';

export type TransactionOptions = {
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

export const DEFAULT_TRANSACTION_OPTIONS: Required<TransactionOptions> = {
  timeoutMs: TRANSACTION_CONFIG.TIMEOUT_MS,
  isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
};
