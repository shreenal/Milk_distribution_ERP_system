export const TRANSACTION_CONFIG = {
  TIMEOUT_MS: 10000,
  ISOLATION_LEVEL: 'Serializable' as const,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 100,
} as const;
