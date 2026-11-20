import { PrismaPg } from '@prisma/adapter-pg';

export function createPgAdapter(opts: { statementTimeoutMs?: number } = {}) {
  const statementTimeoutMs =
    opts.statementTimeoutMs ??
    Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15000);

  return new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    connectionTimeoutMillis: Number(
      process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000,
    ),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
    options: `-c statement_timeout=${statementTimeoutMs} -c timezone=UTC`,
  });
}
