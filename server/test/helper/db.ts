// test/helper/db.ts
//
// Real-Postgres test client for integration/rollback/concurrency specs (plan §18).
// Mirrors the exact DB-safety check and connection setup already used by
// test-seed.ts / test-environment.ts, so this can only ever point at
// "milk_distribution_test" — never the development database.
//
// PRECONDITION: the master-data seed (test-seed.ts) has already been run against this
// database before any spec importing this file runs. This helper does NOT reseed master
// data (roles, dairies, distributors, groups, products, product links, rates, vehicles,
// tray rules, etc. — plan §17's "stable/shared seed data"). It only truncates the per-day
// transactional graph that Paper-module tests create, between tests, per plan §18's
// "schema-per-file with truncate-between-tests" default (chosen over per-test transaction
// rollback because the app's own services open their own $transaction blocks, and the plan
// flags nested test-transactions around those as driver-dependent/risky without
// verification we don't have here).

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

/**
 * Real PrismaClient. Structurally compatible with the app's PrismaOrTransaction type
 * (same generated model delegates), so it can be handed to any repository's `db` param.
 */
export const testPrisma = new PrismaClient({ adapter });

/**
 * Deletes every order_paper row. Every table that hangs off a paper — order_sheet,
 * order_sheet_items, order_sheet_product, client_collection, client_tray_transaction,
 * vehicle_allocation_paper (+ vehicle_allocation, vehicle_distribution_assignment),
 * purchase_paper (+ purchase_entry), dairy_tray_paper (+ dairy_tray_transaction),
 * distributor_transfer, cash_bank_deposit, cash_direct_collection, cash_route_settlement
 * (+ cash_route_expense) — is declared `onDelete: Cascade` from order_paper (directly or
 * transitively via order_sheet), so this single delete is FK-safe and complete. Master
 * data seeded by test-seed.ts is untouched.
 */
export async function resetPaperData(): Promise<void> {
  await testPrisma.order_paper.deleteMany();
}

/**
 * Fails fast with a clear message if test-seed.ts has not been run, instead of letting
 * every downstream test fail confusingly on "no active groups".
 */
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
