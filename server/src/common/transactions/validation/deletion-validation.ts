export function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids)];
}

export function unknownIds(
  ids: number[],
  existingIds: ReadonlySet<number>,
): number[] {
  return uniqueIds(ids).filter((id) => !existingIds.has(id));
}

export function overlappingIds(
  savedIds: number[],
  deletedIds: number[],
): number[] {
  const deleted = new Set(deletedIds);
  return uniqueIds(savedIds).filter((id) => deleted.has(id));
}
