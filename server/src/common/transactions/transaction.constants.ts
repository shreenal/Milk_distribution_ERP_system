export const TRANSACTION_CONFIG = {
  TIMEOUT_MS: 10000,
  // Prisma's default is 2000. Time to wait for a pooled connection before the
  // transaction starts. PLACEHOLDER: tune together with DB_POOL_MAX.
  MAX_WAIT_MS: 5000,
  ISOLATION_LEVEL: 'Serializable' as const,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 100,
} as const;

export const TRANSACTION_TIMED_OUT_MESSAGE =
  'The request took too long and nothing was saved. Please retry.';
