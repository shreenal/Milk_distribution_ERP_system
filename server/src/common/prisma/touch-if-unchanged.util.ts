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
