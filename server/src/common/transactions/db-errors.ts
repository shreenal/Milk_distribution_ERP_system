type DbError = {
  code?: unknown;
  meta?: {
    code?: unknown;
    driverAdapterError?: { cause?: { originalCode?: unknown } };
  };
  cause?: { originalCode?: unknown };
};

const asDbError = (e: unknown): DbError | null =>
  e && typeof e === 'object' ? e : null;

/** Unique-constraint violation, in every shape the pg driver adapter can surface. */
export function isUniqueViolation(e: unknown): boolean {
  const x = asDbError(e);
  return (
    x?.code === '23505' ||
    x?.code === 'P2002' ||
    x?.meta?.code === '23505' ||
    x?.cause?.originalCode === '23505' ||
    x?.meta?.driverAdapterError?.cause?.originalCode === '23505'
  );
}

/** Postgres serialization failure (40001) or Prisma's P2034. */
export function isSerializationFailure(e: unknown): boolean {
  const x = asDbError(e);
  return (
    x?.code === 'P2034' ||
    x?.meta?.code === '40001' ||
    x?.meta?.driverAdapterError?.cause?.originalCode === '40001' ||
    x?.cause?.originalCode === '40001'
  );
}

/** Prisma interactive-transaction timeout / expiry. */
export function isTransactionTimeout(e: unknown): boolean {
  return asDbError(e)?.code === 'P2028';
}
