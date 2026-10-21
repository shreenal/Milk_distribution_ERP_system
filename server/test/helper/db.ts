import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

config({
  path: '.env.test.local',
  override: true,
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'Test database configuration is missing: DATABASE_URL was not loaded.',
  );
}

const database = new URL(databaseUrl);

if (database.pathname !== '/milk_distribution_test') {
  throw new Error(
    `Refusing to run integration tests against database "${database.pathname.slice(1)}". ` +
      'Expected "milk_distribution_test".',
  );
}

const adapter = new PrismaPg(databaseUrl);

export const testPrisma = new PrismaClient({ adapter });

export async function resetPaperData(): Promise<void> {
  await testPrisma.order_paper.deleteMany();
}

export async function assertSeedDataPresent(): Promise<void> {
  const activeGroupCount = await testPrisma.master_group.count({
    where: { is_active: true },
  });

  if (activeGroupCount === 0) {
    throw new Error(
      'No active master_group rows found in milk_distribution_test. Run the master-data ' +
        'seed (test-seed.ts) before running Paper module integration specs.',
    );
  }
}
