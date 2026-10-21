export async function touchIfUnchanged<
  TDb extends {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  },
>(
  db: TDb,
  idWhere: Record<string, unknown>,
  timestampField: string,
  expectedUpdatedAt: Date | null,
): Promise<{ count: number }> {
  return db.updateMany({
    where: {
      ...idWhere,
      ...(expectedUpdatedAt !== null
        ? { [timestampField]: expectedUpdatedAt }
        : {}),
    },
    data: { [timestampField]: new Date() },
  });
}

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
  field: string,
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
