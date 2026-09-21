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
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import { ClientTraysPropagationService } from '../client-trays/services/client-trays-propagation.service.js';
import { ClientTraysRepository } from '../client-trays/client-trays.repository.js';
import { DairyTraysPropagationService } from '../dairy-trays/services/dairy-trays-propagation.service.js';
import { DistributorTransferPropagationService } from '../distributor-transfer/services/distributor-transfer-propagation.service.js';
import { PaperRepository } from './paper.repository.js';
import { PaperService } from './paper.service.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';
import { ERROR_MESSAGES } from './paper.constants.js';

describe('PaperService rollback (integration)', () => {
  const paperRepository = new PaperRepository(testPrisma);

  let service: PaperService;

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetPaperData();

    service = new PaperService(
      paperRepository,
      {} as any,
      {} as any,
      testPrisma,
      {} as any,
    );
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('rolls back order_paper when order-sheet generation fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));

    const generateOrderSheetsSpy = vi
      .spyOn(paperRepository, 'generateOrderSheets')
      .mockRejectedValue(new Error('order sheet generation failed'));

    await expect(service.generatePaperService('2026-09-11')).rejects.toThrow(
      'order sheet generation failed',
    );

    const papers = await testPrisma.order_paper.findMany({
      where: {
        order_date: new Date('2026-09-10T00:00:00.000Z'),
      },
    });

    expect(papers).toHaveLength(0);

    expect(generateOrderSheetsSpy).toHaveBeenCalled();
  });

  it('rolls back order_paper when there are no active groups at generation time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));

    const activeGroups = await testPrisma.master_group.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    await testPrisma.master_group.updateMany({
      where: { is_active: true },
      data: { is_active: false },
    });

    try {
      await expect(service.generatePaperService('2026-08-20')).rejects.toThrow(
        ERROR_MESSAGES.NO_ACTIVE_GROUPS,
      );

      const papers = await testPrisma.order_paper.findMany({
        where: {
          order_date: new Date('2026-08-19T00:00:00.000Z'),
        },
      });

      expect(papers).toHaveLength(0);
    } finally {
      // Restore shared master data — other spec files depend on these
      // groups being active (see assertSeedDataPresent in test/helper/db.ts).
      await testPrisma.master_group.updateMany({
        where: { id: { in: activeGroups.map((g) => g.id) } },
        data: { is_active: true },
      });
    }
  });

  it('rolls back paper finalization when downstream propagation fails', async () => {
    /*
     * Use the real downstream propagation path:
     *
     * Paper
     *   -> Client Trays propagation
     *      -> client_tray_transaction INSERT
     *
     * The tray write is allowed to happen and then we throw.
     * The outer PaperService transaction must roll everything back.
     */

    const clientTraysRepository = new ClientTraysRepository(testPrisma);

    const workflowStateMock = {
      validateTransition: vi.fn(),
      resolveUseOrderedQuantity: vi.fn().mockReturnValue(false),
    };

    const trayCalculationService = new TrayCalculationService(testPrisma);

    const clientTraysPropagationService = new ClientTraysPropagationService(
      clientTraysRepository,
      trayCalculationService,
      workflowStateMock as any,
    );

    const dairyTraysPropagationService = new DairyTraysPropagationService(
      {} as any,
      {} as any,
    );

    const distributorTransferPropagationService =
      new DistributorTransferPropagationService({} as any);

    const dependencyOrchestrator = new DependencyOrchestratorService(
      clientTraysPropagationService,
      dairyTraysPropagationService,
      distributorTransferPropagationService,
    );

    /*
     * Create the paper and its order sheet using the real repository.
     */
    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-09-10T00:00:00.000Z'),
    );

    const groups = await paperRepository.getActiveGroups();

    expect(groups.length).toBeGreaterThan(0);

    await paperRepository.generateOrderSheets(paper.id, groups);

    const sheet = await testPrisma.order_sheet.findFirst({
      where: {
        order_paper_id: paper.id,
      },
    });

    expect(sheet).not.toBeNull();

    /*
     * Seed a real order_sheet_items row using:
     *
     *   C001
     *   GOV-COW-500
     *
     * The seed guarantees this is a valid client/product/tray-rule
     * combination.
     */
    const client = await testPrisma.master_client.findFirst({
      where: {
        code: 'C001',
      },
    });

    const product = await testPrisma.master_product.findFirst({
      where: {
        code: 'GOV-COW-500',
      },
    });

    const productLink = await testPrisma.master_product_link.findFirst({
      where: {
        product_id: product!.id,
        is_active: true,
      },
    });

    expect(client).not.toBeNull();
    expect(product).not.toBeNull();
    expect(productLink).not.toBeNull();

    await testPrisma.order_sheet_items.create({
      data: {
        order_sheet_id: sheet!.id,
        client_id: client!.id,
        product_id: product!.id,
        product_link_id: productLink!.id,
        ordered_qty: 10,
        delivered_qty: 10,
      },
    });

    /*
     * Put the paper into the state from which finalization is legal.
     */
    await testPrisma.order_paper.update({
      where: {
        id: paper.id,
      },
      data: {
        status: OrderPaperStatus.MORNING_SUBMITTED,
      },
    });

    /*
     * Make the client-tray repository perform its real DB write,
     * then fail immediately afterwards.
     *
     * This is the important part of the rollback test.
     */
    const originalReplace = clientTraysRepository.replaceTrayTransactions.bind(
      clientTraysRepository,
    );

    const replaceTrayTransactionsSpy = vi
      .spyOn(clientTraysRepository, 'replaceTrayTransactions')
      .mockImplementation(async (entries, db) => {
        await originalReplace(entries, db);

        throw new Error('forced propagation failure');
      });

    /*
     * Replace the service's orchestrator with the REAL orchestrator.
     * Validation/workflow are mocked because they are not what this
     * rollback test is testing.
     */
    service = new PaperService(
      paperRepository,
      {
        validateFinalizeReadiness: vi.fn().mockResolvedValue(paper),
      } as any,
      {
        validateTransition: vi.fn(),
        resolveUseOrderedQuantity: vi.fn().mockReturnValue(false),
      } as any,
      testPrisma,
      dependencyOrchestrator,
    );

    await expect(service.finalizePaperService(paper.id)).rejects.toThrow(
      'forced propagation failure',
    );

    /*
     * Fresh reads outside the failed transaction.
     */
    const persistedPaper = await testPrisma.order_paper.findUnique({
      where: {
        id: paper.id,
      },
    });

    expect(persistedPaper?.status).toBe(OrderPaperStatus.MORNING_SUBMITTED);

    /*
     * The downstream tray write happened inside the transaction,
     * but must have disappeared when finalization rolled back.
     */
    const trayTransactions = await testPrisma.client_tray_transaction.findMany({
      where: {
        order_sheet_id: sheet!.id,
      },
    });

    expect(trayTransactions).toHaveLength(0);

    expect(replaceTrayTransactionsSpy).toHaveBeenCalled();
  });

  it('rolls back night submission when the status write fails after the DB update', async () => {
    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-09-10T00:00:00.000Z'),
    );

    const validationMock = {
      validateNightSubmitReadiness: vi.fn().mockResolvedValue(paper),
    };

    const workflowStateMock = {
      validateTransition: vi.fn(),
    };

    const originalSubmitNightEntry =
      paperRepository.submitNightEntry.bind(paperRepository);

    const submitNightEntrySpy = vi
      .spyOn(paperRepository, 'submitNightEntry')
      .mockImplementation(async (paperId, db) => {
        await originalSubmitNightEntry(paperId, db);

        throw new Error('forced night submission failure');
      });

    service = new PaperService(
      paperRepository,
      validationMock as any,
      workflowStateMock as any,
      testPrisma,
      {} as any,
    );

    await expect(service.submitNightEntryService(paper.id)).rejects.toThrow(
      'forced night submission failure',
    );

    const persistedPaper = await testPrisma.order_paper.findUnique({
      where: { id: paper.id },
    });

    expect(persistedPaper?.status).toBe(OrderPaperStatus.DRAFT);
    expect(submitNightEntrySpy).toHaveBeenCalled();
  });

  it('rolls back morning submission when the status write fails after the DB update', async () => {
    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-09-10T00:00:00.000Z'),
    );

    await testPrisma.order_paper.update({
      where: { id: paper.id },
      data: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      },
    });

    const submittedPaper = await paperRepository.findPaperById(paper.id);

    expect(submittedPaper?.status).toBe(OrderPaperStatus.NIGHT_SUBMITTED);

    const validationMock = {
      validateMorningSubmitReadiness: vi.fn().mockResolvedValue(submittedPaper),
    };

    const workflowStateMock = {
      validateTransition: vi.fn(),
    };

    const originalSubmitMorningEntry =
      paperRepository.submitMorningEntry.bind(paperRepository);

    const submitMorningEntrySpy = vi
      .spyOn(paperRepository, 'submitMorningEntry')
      .mockImplementation(async (paperId, db) => {
        await originalSubmitMorningEntry(paperId, db);

        throw new Error('forced morning submission failure');
      });

    service = new PaperService(
      paperRepository,
      validationMock as any,
      workflowStateMock as any,
      testPrisma,
      {} as any,
    );

    await expect(service.submitMorningEntryService(paper.id)).rejects.toThrow(
      'forced morning submission failure',
    );

    const persistedPaper = await testPrisma.order_paper.findUnique({
      where: { id: paper.id },
    });

    expect(persistedPaper?.status).toBe(OrderPaperStatus.NIGHT_SUBMITTED);

    expect(submitMorningEntrySpy).toHaveBeenCalled();
  });

  it('rolls back reopen when the status write fails after the DB update', async () => {
    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-09-10T00:00:00.000Z'),
    );

    await testPrisma.order_paper.update({
      where: { id: paper.id },
      data: {
        status: OrderPaperStatus.FINALIZED,
      },
    });

    const workflowStateMock = {
      validateTransition: vi.fn(),
    };

    const originalReopenPaper =
      paperRepository.reopenPaper.bind(paperRepository);

    const reopenPaperSpy = vi
      .spyOn(paperRepository, 'reopenPaper')
      .mockImplementation(async (paperId, reason, db) => {
        await originalReopenPaper(paperId, reason, db);

        throw new Error('forced reopen failure');
      });

    service = new PaperService(
      paperRepository,
      {} as any,
      workflowStateMock as any,
      testPrisma,
      {} as any,
    );

    await expect(
      service.reopenPaperService(paper.id, 'rollback test'),
    ).rejects.toThrow('forced reopen failure');

    const persistedPaper = await testPrisma.order_paper.findUnique({
      where: { id: paper.id },
    });

    expect(persistedPaper?.status).toBe(OrderPaperStatus.FINALIZED);

    expect(persistedPaper?.reopen_reason).toBeNull();

    expect(reopenPaperSpy).toHaveBeenCalled();
  });
});
