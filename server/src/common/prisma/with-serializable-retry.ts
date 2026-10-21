import { ConflictException } from '@nestjs/common';
import { TRANSACTION_CONFIG } from './transaction.constants.js';

export async function withSerializableRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  let attempt = 0;
  // Postgres serialization failures surface as error code 40001.
  for (;;) {
    try {
      return await run();
    } catch (err: unknown) {
      const isSerializationFailure =
        isPrismaSerializationFailure(err) ||
        isPostgresSerializationFailure(err);

      attempt += 1;

      if (!isSerializationFailure) {
        throw err;
      }

      if (attempt >= TRANSACTION_CONFIG.MAX_RETRIES) {
        // Exhausted retries on a concurrent-write conflict is a retryable
        // condition for the caller, not an internal server error.
        throw new ConflictException(
          'Your request conflicted with another update and could not be completed. Please retry.',
        );
      }
      await new Promise((r) =>
        setTimeout(r, TRANSACTION_CONFIG.RETRY_DELAY_MS * attempt),
      );
    }
  }

  function isPrismaSerializationFailure(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }

    if (!('code' in err)) {
      return false;
    }

    return err.code === 'P2034';
  }

  function isPostgresSerializationFailure(err: unknown): boolean {
    const e = err as {
      meta?: {
        code?: unknown;
        driverAdapterError?: { cause?: { originalCode?: unknown } };
      };
      cause?: { originalCode?: unknown };
    } | null;
    return (
      e?.meta?.code === '40001' ||
      e?.meta?.driverAdapterError?.cause?.originalCode === '40001' ||
      e?.cause?.originalCode === '40001'
    );
  }
}
