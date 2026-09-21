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
    `Refusing to run tests against database "${database.pathname.slice(1)}". ` +
      'Expected "milk_distribution_test".',
  );
}
