export function obsoleteDerivedRows<Existing, Incoming>(
  existing: Existing[],
  incoming: Incoming[],
  keyOfExisting: (row: Existing) => string,
  keyOfIncoming: (row: Incoming) => string,
): Existing[] {
  const incomingKeys = new Set(incoming.map(keyOfIncoming));
  return existing.filter((row) => !incomingKeys.has(keyOfExisting(row)));
}
