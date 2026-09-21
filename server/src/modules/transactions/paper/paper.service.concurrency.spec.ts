import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';
import { PaperRepository } from './paper.repository.js';
import { PaperService } from './paper.service.js';

describe('PaperService concurrency (integration)', () => {
  const paperRepository = new PaperRepository(testPrisma);

  let service: PaperService;

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetPaperData();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));

    service = new PaperService(
      paperRepository,
      {} as any,
      {} as any,
      testPrisma,
      {} as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  it('returns the same paper when two concurrent generations race', async () => {
    const orderDate = new Date('2026-09-10T00:00:00.000Z');

    let enteredCreate = 0;

    let releaseRace!: () => void;

    const raceBarrier = new Promise<void>((resolve) => {
      releaseRace = resolve;
    });

    const originalGenerate =
      paperRepository.generatePaperFromOrderDate.bind(paperRepository);

    vi.spyOn(paperRepository, 'generatePaperFromOrderDate').mockImplementation(
      async (date, db) => {
        enteredCreate += 1;

        if (enteredCreate === 2) {
          releaseRace();
        }

        await raceBarrier;

        return originalGenerate(date, db);
      },
    );

    const callA = service.generatePaperService('2026-09-11');
    const callB = service.generatePaperService('2026-09-11');

    const [paperA, paperB] = await Promise.all([callA, callB]);

    expect(paperA.id).toBe(paperB.id);

    const papers = await testPrisma.order_paper.findMany({
      where: {
        order_date: orderDate,
      },
    });

    expect(papers).toHaveLength(1);
    expect(papers[0].id).toBe(paperA.id);

    const sheets = await testPrisma.order_sheet.findMany({
      where: {
        order_paper_id: paperA.id,
      },
    });

    expect(sheets).toHaveLength(10);
  });

  it('returns the same paper when multiple concurrent generations race', async () => {
    const orderDate = new Date('2026-09-10T00:00:00.000Z');
    const concurrentUsers = 10;

    let enteredCreate = 0;
    let releaseRace!: () => void;

    const raceBarrier = new Promise<void>((resolve) => {
      releaseRace = resolve;
    });

    const originalGenerate =
      paperRepository.generatePaperFromOrderDate.bind(paperRepository);

    vi.spyOn(paperRepository, 'generatePaperFromOrderDate').mockImplementation(
      async (date, db) => {
        enteredCreate += 1;

        if (enteredCreate === concurrentUsers) {
          releaseRace();
        }

        await raceBarrier;

        return originalGenerate(date, db);
      },
    );

    const calls = Array.from({ length: concurrentUsers }, () =>
      service.generatePaperService('2026-09-11'),
    );

    const papers = await Promise.all(calls);

    const paperIds = new Set(papers.map((paper) => paper.id));

    expect(paperIds.size).toBe(1);

    const [paper] = papers;

    const dbPapers = await testPrisma.order_paper.findMany({
      where: {
        order_date: orderDate,
      },
    });

    expect(dbPapers).toHaveLength(1);
    expect(dbPapers[0].id).toBe(paper.id);

    const sheets = await testPrisma.order_sheet.findMany({
      where: {
        order_paper_id: paper.id,
      },
    });

    expect(sheets).toHaveLength(10);
  });
});
