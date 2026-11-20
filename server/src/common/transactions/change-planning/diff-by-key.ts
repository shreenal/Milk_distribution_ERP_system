import type { ChangePlan } from './change-plan.js';

export function diffByKey<Existing, Incoming>(
  existing: Existing[],
  incoming: Incoming[],
  keyOfExisting: (row: Existing) => string,
  keyOfIncoming: (row: Incoming) => string,
  hasChanged: (existingRow: Existing, incomingRow: Incoming) => boolean,
): ChangePlan<Existing, Incoming> {
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
  const toUpdate: ChangePlan<Existing, Incoming>['toUpdate'] = [];

  for (const incomingRow of incoming) {
    const match = existingByKey.get(keyOfIncoming(incomingRow));

    if (match && hasChanged(match, incomingRow)) {
      toUpdate.push({ existingRow: match, incomingRow });
    }
  }

  return { toDelete, toInsert, toUpdate };
}
