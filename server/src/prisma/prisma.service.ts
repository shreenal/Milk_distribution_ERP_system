// prisma.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      connectionTimeoutMillis: Number(
        process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000,
      ),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
      // Belt-and-suspenders: also cap query duration server-side so a
      // runaway query can't hold a pooled connection forever even if the
      // client-side driver settings above are bypassed.
      options: `-c statement_timeout=${Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15000)}`,
    });

    super({ adapter });
  }
}
