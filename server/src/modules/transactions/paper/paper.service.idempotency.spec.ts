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
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';

describe('PaperService night-submit idempotency (integration, plan §12)', () => {
  const paperRepository = new PaperRepository(testPrisma);
  const workflowState = new WorkflowStateService();

  let service: PaperService;

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetPaperData();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  it('rejects a resubmit of an already NIGHT_SUBMITTED paper without touching night_entry_submitted_at or status', async () => {
    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-08-10T00:00:00.000Z'),
    );

    const submitted = await paperRepository.submitNightEntry(paper.id);
    const originalSubmittedAt = submitted.night_entry_submitted_at;

    // Exercises the real workflowState.validateTransition gate that
    // submitNightEntryService actually calls. Readiness sub-validators
    // are stubbed since their own DB reads are already covered in
    // paper-validation.spec.ts — this test isolates the transition-map
    // rejection and its DB-state side effects specifically.
    service = new PaperService(
      paperRepository,
      {
        validateNightSubmitReadiness: async () =>
          paperRepository.findPaperById(paper.id),
      } as any,
      workflowState,
      testPrisma,
      {} as any,
    );

    await expect(service.submitNightEntryService(paper.id)).rejects.toThrow(
      `Cannot transition from ${OrderPaperStatus.NIGHT_SUBMITTED} to ${OrderPaperStatus.NIGHT_SUBMITTED}`,
    );

    const persisted = await testPrisma.order_paper.findUniqueOrThrow({
      where: { id: paper.id },
    });

    expect(persisted.status).toBe(OrderPaperStatus.NIGHT_SUBMITTED);
    expect(persisted.night_entry_submitted_at?.toISOString()).toBe(
      originalSubmittedAt?.toISOString(),
    );
  });
});
