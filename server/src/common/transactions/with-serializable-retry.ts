import { ConflictException } from '@nestjs/common';
import { isSerializationFailure } from './db-errors.js';
import { TRANSACTION_CONFIG } from './transaction.constants.js';

export async function withSerializableRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  // Postgres serialization failures surface as error code 40001.
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err: unknown) {
      if (!isSerializationFailure(err)) throw err;

      if (attempt >= TRANSACTION_CONFIG.MAX_RETRIES) {
        throw new ConflictException(
          'Your request conflicted with another update and could not be completed. Please retry.',
        );
      }
      await new Promise((r) =>
        setTimeout(r, TRANSACTION_CONFIG.RETRY_DELAY_MS * attempt),
      );
    }
  }
}
