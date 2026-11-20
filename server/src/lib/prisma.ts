import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPgAdapter } from './pg-adapter.js';

const prisma = new PrismaClient({
  adapter: createPgAdapter({ statementTimeoutMs: 0 }), // 0 = no limit
});

export { prisma };
