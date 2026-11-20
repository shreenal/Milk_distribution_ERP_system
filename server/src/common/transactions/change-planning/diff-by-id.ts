import type { ChangePlan } from './change-plan.js';

export function diffById<Existing extends { id: number }, Incoming>(
  existing: Existing[],
  incoming: Incoming[],
  idOfIncoming: (row: Incoming) => number,
  hasChanged: (existingRow: Existing, incomingRow: Incoming) => boolean,
): ChangePlan<Existing, Incoming> {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const incomingById = new Map(incoming.map((row) => [idOfIncoming(row), row]));

  const toDelete = existing.filter((row) => !incomingById.has(row.id));
  const toInsert = incoming.filter(
    (row) => !existingById.has(idOfIncoming(row)),
  );
  const toUpdate: ChangePlan<Existing, Incoming>['toUpdate'] = [];

  for (const incomingRow of incoming) {
    const match = existingById.get(idOfIncoming(incomingRow));
    if (match && hasChanged(match, incomingRow)) {
      toUpdate.push({ existingRow: match, incomingRow });
    }
  }

  return { toDelete, toInsert, toUpdate };
}
