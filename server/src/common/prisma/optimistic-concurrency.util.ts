import { ConflictException } from '@nestjs/common';

const DEFAULT_MESSAGE =
  'This data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

/**
 * FIX F10 (consistency review): the "touch the row only if updated_at still
 * matches what the client last read, else 409" flow - including the same
 * conflict message text - was implemented independently in
 * vehicle-allocation.service.ts and purchase.service.ts. `touchIfUnchanged`
 * should be the repository call that performs the atomic conditional update
 * (e.g. `updateMany({ where: { id, updated_at: expected }, data: {...} })`);
 * this just standardizes interpreting its result and raising the conflict.
 */
export async function assertNotStale(
  touchIfUnchanged: () => Promise<{ count: number } | boolean>,
  message: string = DEFAULT_MESSAGE,
): Promise<void> {
  const result = await touchIfUnchanged();
  const succeeded = typeof result === 'boolean' ? result : result.count === 1;

  if (!succeeded) {
    throw new ConflictException(message);
  }
}
