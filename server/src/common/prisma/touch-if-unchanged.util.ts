// Columns that act as optimistic-concurrency tokens. A typo here would make the
// conditional update silently match nothing, so the set is closed.
export type TokenField =
  | 'updated_at'
  | 'order_items_updated_at'
  | 'collections_updated_at'
  | 'client_trays_updated_at';

export async function touchIfTokenMatches<
  TDb extends {
    updateMany: (a: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  },
>(
  db: TDb,
  idWhere: Record<string, unknown>,
  field: TokenField,
  expected: Date | null,
): Promise<{ count: number; touchedAt: Date }> {
  const now = new Date();
  const touchedAt =
    expected !== null && now.getTime() <= expected.getTime()
      ? new Date(expected.getTime() + 1)
      : now;
  const { count } = await db.updateMany({
    where: { ...idWhere, [field]: expected },
    data: { [field]: touchedAt },
  });
  return { count, touchedAt };
}
