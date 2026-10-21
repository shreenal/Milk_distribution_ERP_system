import { istDayBoundsUtc, formatIsoDate } from '../paper/paper-date.util.js';
import { toDecimal } from '../../../common/utils/money.util.js';
import { PURCHASE_LIMITS } from './purchase.constants.js';

/** PD-27: at most 2 decimal places (exact decimal check, safe for 1e-7). */
export function hasAllowedPrecision(qty: number): boolean {
  return toDecimal(qty).decimalPlaces() <= PURCHASE_LIMITS.QTY_DECIMAL_PLACES;
}

/**
 * PD-37: a saved entry is stale only when its allocation snapshot explicitly
 * differs from the current allocation. A legacy row with no snapshot at all
 * (both fields empty) is never stale. If the allocation row was deleted the
 * id snapshot is nulled by the database but the quantity snapshot stays, so
 * that case still counts as stale.
 */
export function isStaleEntry(
  entry: { source_allocation_id: number | null; source_allocated_qty: unknown },
  allocation: { id: number; allocated_qty: unknown } | undefined,
): boolean {
  if (
    entry.source_allocation_id === null &&
    entry.source_allocated_qty == null
  ) {
    return false;
  }
  if (!allocation) return true;
  return (
    entry.source_allocation_id !== allocation.id ||
    Number(entry.source_allocated_qty ?? NaN) !==
      Number(allocation.allocated_qty)
  );
}

type DatedRate = { effective_from: Date; effective_to: Date | null };

/**
 * PD-26: the gatepass date is an IST calendar day. A rate is valid when its
 * effective-from falls on or before that IST day and its effective-to is empty
 * or falls on or after it. Stored timestamps are UTC instants, so they are
 * compared with the IST day bounds, never with a UTC midnight instant.
 * (effective_from < next IST midnight, effective_to >= IST day start.)
 */
export function resolveRateForDate<T extends DatedRate>(
  rates: T[],
  gatepassDate: Date,
): T | null {
  const { start, end } = istDayBoundsUtc(gatepassDate);
  let best: T | null = null;

  for (const rate of rates) {
    const fromOk = rate.effective_from.getTime() < end.getTime();
    const toOk =
      rate.effective_to === null ||
      rate.effective_to.getTime() >= start.getTime();
    if (!fromOk || !toOk) continue;
    if (
      !best ||
      rate.effective_from.getTime() > best.effective_from.getTime()
    ) {
      best = rate;
    }
  }
  return best;
}

export function rateKey(productLinkId: number, gatepassDate: Date): string {
  return `${productLinkId}_${formatIsoDate(gatepassDate)}`;
}
