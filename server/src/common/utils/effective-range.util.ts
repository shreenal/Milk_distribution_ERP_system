const startOfUtcDay = (d: Date) =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const endOfUtcDay = (d: Date) =>
  Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    23,
    59,
    59,
    999,
  );

/**
 * True if the range overlaps the UTC calendar day of `asOf`.
 * effective_to === null means open-ended; effective_to is inclusive of its day.
 */
export function isEffectiveOn(
  range: { effective_from: Date; effective_to: Date | null },
  asOf: Date,
): boolean {
  if (range.effective_from.getTime() > endOfUtcDay(asOf)) return false;
  if (
    range.effective_to !== null &&
    range.effective_to.getTime() < startOfUtcDay(asOf)
  ) {
    return false;
  }
  return true;
}
