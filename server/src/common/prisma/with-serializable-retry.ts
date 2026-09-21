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
      if (
        !isSerializationFailure ||
        attempt >= TRANSACTION_CONFIG.MAX_RETRIES
      ) {
        throw err;
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
    if (!err || typeof err !== 'object') {
      return false;
    }

    if (!('meta' in err)) {
      return false;
    }

    const meta = err.meta;

    if (!meta || typeof meta !== 'object') {
      return false;
    }

    if (!('code' in meta)) {
      return false;
    }

    return meta.code === '40001';
  }
}
