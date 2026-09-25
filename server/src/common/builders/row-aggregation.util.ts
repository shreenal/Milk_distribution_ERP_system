/**
 * FIX F7 (consistency review): the "look up or default to 0, then add" logic
 * for a dynamic `product_{id}` row field was copy-identical in
 * group-summary.builder.ts and allocation-summary.builder.ts. Extracted here
 * so both builders share one implementation of the accumulation rule.
 */
export function accumulateProductField(
  row: Record<string, unknown>,
  productId: number,
  quantity: number,
): void {
  const field = `product_${productId}`;
  const currentValue =
    typeof row[field] === 'number' ? (row[field] as number) : 0;
  row[field] = currentValue + quantity;
}

/**
 * FIX F8: "sum numeric fields across a set of rows, skipping identity keys"
 * was implemented separately in group-summary.builder.ts (per-brand totals)
 * and vehicle-allocation.builder.ts (per-grid required totals). Extracted
 * here so both use one implementation.
 */
export function sumNumericFields(
  rows: Record<string, unknown>[],
  excludeKeys: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (excludeKeys.includes(key)) {
        continue;
      }

      totals[key] = (totals[key] ?? 0) + Number(value ?? 0);
    }
  }

  return totals;
}
