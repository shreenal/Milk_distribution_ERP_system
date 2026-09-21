import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PaperRepository } from './paper.repository.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

/**
 * Layer 3 (plan §6) — real Postgres, never mocked. Exercises PaperRepository directly
 * against real schema constraints (plan §9) and confirms the repository's own read/write
 * shapes, independent of PaperService's orchestration (already covered at layer 2 in
 * paper.service.spec.ts).
 *
 * Precondition: test-seed.ts has been run against milk_distribution_test. This file does
 * not reseed; it only truncates the per-paper transactional graph between tests (see
 * test/helper/db.ts).
 */
describe('PaperRepository (integration)', () => {
  const paperRepository = new PaperRepository(testPrisma);

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    await resetPaperData();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  describe('schema invariants (plan §9)', () => {
    it('rejects a second order_paper with a duplicate order_date', async () => {
      const orderDate = new Date('2027-01-04T00:00:00.000Z');

      await paperRepository.generatePaperFromOrderDate(orderDate);

      await expect(
        paperRepository.generatePaperFromOrderDate(orderDate),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects a second order_paper with a duplicate sale_date, independent of order_date', async () => {
      // generatePaperFromOrderDate always derives sale_date = order_date + 1 day, so a
      // sale_date collision can only be produced independently of an order_date
      // collision via a direct write — which is exactly what the sale_date @@unique
      // constraint exists to guard against regardless of how a row gets inserted.
      const sharedSaleDate = new Date('2027-01-06T00:00:00.000Z');

      await testPrisma.order_paper.create({
        data: {
          order_date: new Date('2027-01-05T00:00:00.000Z'),
          sale_date: sharedSaleDate,
          status: OrderPaperStatus.DRAFT,
        },
      });

      await expect(
        testPrisma.order_paper.create({
          data: {
            order_date: new Date('2027-01-07T00:00:00.000Z'),
            sale_date: sharedSaleDate,
            status: OrderPaperStatus.DRAFT,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects a duplicate order_sheet for the same (order_paper_id, group_id)', async () => {
      const paper = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-01-08T00:00:00.000Z'),
      );

      const groups = await paperRepository.getActiveGroups();
      const [firstGroup] = groups;

      await paperRepository.generateOrderSheets(paper.id, [firstGroup]);

      await expect(
        testPrisma.order_sheet.create({
          data: {
            order_paper_id: paper.id,
            group_id: firstGroup.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('generateOrderSheets skipDuplicates behavior (plan §7.4)', () => {
    it('creates exactly one sheet per active group and is a no-op on retry', async () => {
      const paper = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-01-09T00:00:00.000Z'),
      );

      const groups = await paperRepository.getActiveGroups();

      const firstCall = await paperRepository.generateOrderSheets(
        paper.id,
        groups,
      );

      expect(firstCall.count).toBe(groups.length);

      const secondCall = await paperRepository.generateOrderSheets(
        paper.id,
        groups,
      );

      expect(secondCall.count).toBe(0);

      const sheets = await testPrisma.order_sheet.findMany({
        where: { order_paper_id: paper.id },
      });

      expect(sheets).toHaveLength(groups.length);
    });
  });

  describe('resolvePaperSaleDate (private helper, verified via persisted row)', () => {
    it('sets sale_date to exactly one UTC day after order_date', async () => {
      const orderDate = new Date('2027-01-10T00:00:00.000Z');

      const paper = await paperRepository.generatePaperFromOrderDate(orderDate);

      expect(paper.sale_date.toISOString()).toBe(
        new Date('2027-01-11T00:00:00.000Z').toISOString(),
      );
    });
  });

  describe('findPaperBySaleDate', () => {
    it('returns null when no paper exists for the given range', async () => {
      const result = await paperRepository.findPaperBySaleDate(
        new Date('2027-02-01T00:00:00.000Z'),
        new Date('2027-02-02T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });

    it('returns the paper whose sale_date falls within [today, tomorrow) and includes its sheets', async () => {
      const orderDate = new Date('2027-02-04T00:00:00.000Z');
      const paper = await paperRepository.generatePaperFromOrderDate(orderDate);

      const groups = await paperRepository.getActiveGroups();
      await paperRepository.generateOrderSheets(paper.id, groups);

      const result = await paperRepository.findPaperBySaleDate(
        new Date('2027-02-05T00:00:00.000Z'),
        new Date('2027-02-06T00:00:00.000Z'),
      );

      expect(result?.id).toBe(paper.id);
      expect(result?.order_sheet).toHaveLength(groups.length);
    });

    it('does not return a paper from an adjacent day', async () => {
      await paperRepository.generatePaperFromOrderDate(
        new Date('2027-02-07T00:00:00.000Z'),
      ); // sale_date 2027-02-08

      const result = await paperRepository.findPaperBySaleDate(
        new Date('2027-02-09T00:00:00.000Z'),
        new Date('2027-02-10T00:00:00.000Z'),
      );

      expect(result).toBeNull();
    });
  });

  describe('findPaperById', () => {
    it('returns null for a non-existent id', async () => {
      const result = await paperRepository.findPaperById(-1);
      expect(result).toBeNull();
    });

    it('returns the paper with its sheets and master_group summary included', async () => {
      const paper = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-02-11T00:00:00.000Z'),
      );
      const groups = await paperRepository.getActiveGroups();
      await paperRepository.generateOrderSheets(paper.id, groups);

      const result = await paperRepository.findPaperById(paper.id);

      expect(result?.id).toBe(paper.id);
      expect(result?.order_sheet).toHaveLength(groups.length);
      expect(result?.order_sheet[0].master_group).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        delivery_session: expect.any(String),
      });
    });
  });

  describe('findLatestPaper', () => {
    it('returns the paper with the most recent order_date', async () => {
      await paperRepository.generatePaperFromOrderDate(
        new Date('2027-03-01T00:00:00.000Z'),
      );
      const latest = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-03-05T00:00:00.000Z'),
      );

      const result = await paperRepository.findLatestPaper();

      expect(result?.id).toBe(latest.id);
    });
  });

  describe('getActiveGroups', () => {
    it('returns only groups where is_active is true', async () => {
      const groups = await paperRepository.getActiveGroups();

      expect(groups.length).toBeGreaterThan(0);
      expect(groups.every((group) => group.is_active)).toBe(true);

      const activeCountInDb = await testPrisma.master_group.count({
        where: { is_active: true },
      });

      expect(groups).toHaveLength(activeCountInDb);
    });
  });

  describe('status-transition writes', () => {
    async function createPaper() {
      return paperRepository.generatePaperFromOrderDate(
        new Date('2027-04-01T00:00:00.000Z'),
      );
    }

    it('submitNightEntry sets status and night_entry_submitted_at', async () => {
      const paper = await createPaper();

      const updated = await paperRepository.submitNightEntry(paper.id);

      expect(updated.status).toBe(OrderPaperStatus.NIGHT_SUBMITTED);
      expect(updated.night_entry_submitted_at).not.toBeNull();

      const persisted = await testPrisma.order_paper.findUniqueOrThrow({
        where: { id: paper.id },
      });
      expect(persisted.status).toBe(OrderPaperStatus.NIGHT_SUBMITTED);
    });

    it('submitMorningEntry sets status and morning_entry_submitted_at', async () => {
      const paper = await createPaper();

      const updated = await paperRepository.submitMorningEntry(paper.id);

      expect(updated.status).toBe(OrderPaperStatus.MORNING_SUBMITTED);
      expect(updated.morning_entry_submitted_at).not.toBeNull();
    });

    it('finalizePaper sets status and finalized_at', async () => {
      const paper = await createPaper();

      const updated = await paperRepository.finalizePaper(paper.id);

      expect(updated.status).toBe(OrderPaperStatus.FINALIZED);
      expect(updated.finalized_at).not.toBeNull();
    });

    it('reopenPaper sets status, reopened_at, and the verbatim reason', async () => {
      const paper = await createPaper();

      const updated = await paperRepository.reopenPaper(
        paper.id,
        'Client dispute on delivered quantity',
      );

      expect(updated.status).toBe(OrderPaperStatus.REOPENED);
      expect(updated.reopened_at).not.toBeNull();
      expect(updated.reopen_reason).toBe(
        'Client dispute on delivered quantity',
      );
    });
  });

  describe('findAllPapers', () => {
    it('returns papers ordered by sale_date descending', async () => {
      const oldest = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-05-01T00:00:00.000Z'),
      );

      const newest = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-05-05T00:00:00.000Z'),
      );

      const middle = await paperRepository.generatePaperFromOrderDate(
        new Date('2027-05-03T00:00:00.000Z'),
      );

      const result = await paperRepository.findAllPapers();

      expect(result.map((paper) => paper.id)).toEqual([
        newest.id,
        middle.id,
        oldest.id,
      ]);
    });
  });
});
