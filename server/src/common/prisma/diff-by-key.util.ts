/**
 * FIX F9 (consistency review): "diff existing vs. incoming rows by a
 * composite key, then delete/update/insert accordingly" was implemented
 * twice - in vehicle-allocation.repository.ts (replaceVehicleAllocations)
 * and purchase.repository.ts (replacePurchaseEntries) - against different
 * Prisma models. This is the shared shape; each repository still owns its
 * own Prisma delete/update/create calls, since those differ per model.
 */
export function diffByKey<Existing, Incoming>(
  existing: Existing[],
  incoming: Incoming[],
  keyOfExisting: (row: Existing) => string,
  keyOfIncoming: (row: Incoming) => string,
  hasChanged: (existingRow: Existing, incomingRow: Incoming) => boolean,
): {
  toDelete: Existing[];
  toInsert: Incoming[];
  toUpdate: { existingRow: Existing; incomingRow: Incoming }[];
} {
  const existingByKey = new Map(
    existing.map((row) => [keyOfExisting(row), row]),
  );
  const incomingByKey = new Map(
    incoming.map((row) => [keyOfIncoming(row), row]),
  );

  const toDelete = existing.filter(
    (row) => !incomingByKey.has(keyOfExisting(row)),
  );
  const toInsert = incoming.filter(
    (row) => !existingByKey.has(keyOfIncoming(row)),
  );

  const toUpdate: { existingRow: Existing; incomingRow: Incoming }[] = [];

  for (const incomingRow of incoming) {
    const match = existingByKey.get(keyOfIncoming(incomingRow));

    if (match && hasChanged(match, incomingRow)) {
      toUpdate.push({ existingRow: match, incomingRow });
    }
  }

  return { toDelete, toInsert, toUpdate };
}
