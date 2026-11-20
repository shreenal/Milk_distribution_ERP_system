export function sameNumber(left: unknown, right: unknown): boolean {
  return Number(left) === Number(right);
}

export function sameNullableNumber(left: unknown, right: unknown): boolean {
  const leftValue = left === null || left === undefined ? null : Number(left);
  const rightValue =
    right === null || right === undefined ? null : Number(right);

  return leftValue === rightValue;
}

export function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}
