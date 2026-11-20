export type ChangePlan<Existing, Incoming> = {
  toDelete: Existing[];
  toInsert: Incoming[];
  toUpdate: { existingRow: Existing; incomingRow: Incoming }[];
};
