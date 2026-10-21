import Decimal from 'decimal.js/decimal.mjs';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type Moneyish =
  Decimal | Decimal.Value | { toString(): string } | null | undefined;

export function toDecimal(value: Moneyish): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
}

export function toMoney(value: Decimal): number {
  return Number(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
}

/** Round to an arbitrary number of decimal places (e.g. 3dp quantities). */
export function toFixedNumber(value: Decimal, decimalPlaces = 2): number {
  return Number(
    value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toString(),
  );
}

export function moneyEquals(a: Moneyish, b: Moneyish, tolerance = 0): boolean {
  return toDecimal(a).minus(toDecimal(b)).abs().lte(tolerance);
}

export function moneyGreaterThan(a: Moneyish, b: Moneyish): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

export { Decimal };
