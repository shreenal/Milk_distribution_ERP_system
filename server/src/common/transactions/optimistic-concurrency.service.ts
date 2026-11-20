import { BadRequestException } from '@nestjs/common';

import type { ConcurrencyToken } from './concurrency.types.js';

export const DEFAULT_INVALID_EXPECTED_UPDATED_AT_MESSAGE =
  'Invalid expectedUpdatedAt';

/**
 * Shared timestamp-token mechanics. Domain modules retain their own token
 * scope, null policy, stale message, and conditional repository update.
 */
export class OptimisticConcurrencyService {
  parseExpectedUpdatedAt(
    expected: string | null,
    invalidMessage = DEFAULT_INVALID_EXPECTED_UPDATED_AT_MESSAGE,
  ): Date | null {
    if (expected === null) return null;

    const date = new Date(expected);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(invalidMessage);
    }

    return date;
  }

  tokenMatches(current: ConcurrencyToken, expected: ConcurrencyToken): boolean {
    return expected === null
      ? current === null
      : current !== null && current.getTime() === expected.getTime();
  }
}

export const optimisticConcurrency = new OptimisticConcurrencyService();
