export function hasId<T extends { id?: number }>(
  entry: T,
): entry is T & {
  id: number;
} {
  return entry.id !== undefined;
}

export function splitById<T extends { id?: number }>(
  entries: T[],
): {
  withId: (T & { id: number })[];
  withoutId: T[];
} {
  const withId: (T & { id: number })[] = [];
  const withoutId: T[] = [];

  for (const entry of entries) {
    if (hasId(entry)) withId.push(entry);
    else withoutId.push(entry);
  }

  return { withId, withoutId };
}
