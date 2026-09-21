import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaperService } from './paper.service.js';
import { DATE_CONFIG, ERROR_MESSAGES } from './paper.constants.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';

const { withSerializableRetryMock } = vi.hoisted(() => ({
  withSerializableRetryMock: vi.fn(),
}));

vi.mock('../../../common/prisma/with-serializable-retry.js', () => ({
  withSerializableRetry: withSerializableRetryMock,
}));

describe('PaperService', () => {
  const paperRepository = {
    findPaperBySaleDate: vi.fn(),
    generatePaperFromOrderDate: vi.fn(),
    getActiveGroups: vi.fn(),
    generateOrderSheets: vi.fn(),
    findPaperById: vi.fn(),
    findLatestPaper: vi.fn(),
    findAllPapers: vi.fn(),
    submitNightEntry: vi.fn(),
    submitMorningEntry: vi.fn(),
    finalizePaper: vi.fn(),
    reopenPaper: vi.fn(),
  };

  const paperValidationService = {
    validateNightSubmitReadiness: vi.fn(),
    validateMorningSubmitReadiness: vi.fn(),
    validateFinalizeReadiness: vi.fn(),
  };

  const workflowState = {
    validateTransition: vi.fn(),
  };

  const prisma = {
    $transaction: vi.fn(),
  };

  const dependencyOrchestrator = {
    execute: vi.fn(),
  };

  let service: PaperService;

  const db = { transaction: true };

  const existingPaper = {
    id: 1,
    order_date: new Date('2026-09-09T00:00:00.000Z'),
    sale_date: new Date('2026-09-10T00:00:00.000Z'),
    status: OrderPaperStatus.DRAFT,
  };

  const generatedPaper = {
    id: 2,
    order_date: new Date('2026-09-09T00:00:00.000Z'),
    sale_date: new Date('2026-09-10T00:00:00.000Z'),
    status: OrderPaperStatus.DRAFT,
  };

  const draftPaper = {
    id: 1,
    status: OrderPaperStatus.DRAFT,
  };

  const nightSubmittedPaper = {
    id: 1,
    status: OrderPaperStatus.NIGHT_SUBMITTED,
  };

  const morningSubmittedPaper = {
    id: 1,
    status: OrderPaperStatus.MORNING_SUBMITTED,
  };

  const reopenedPaper = {
    id: 1,
    status: OrderPaperStatus.REOPENED,
  };

  const finalizedPaper = {
    id: 1,
    status: OrderPaperStatus.FINALIZED,
  };

  const groups = [{ id: 10 }, { id: 20 }, { id: 30 }];

  beforeEach(() => {
    vi.resetAllMocks();

    service = new PaperService(
      paperRepository as any,
      paperValidationService as any,
      workflowState as any,
      prisma as any,
      dependencyOrchestrator as any,
    );

    /*
     * For these unit tests, execute the transaction callback immediately
     * against the supplied transaction object.
     */
    withSerializableRetryMock.mockImplementation(async (operation) => {
      return operation();
    });

    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(db);
    });

    paperRepository.generatePaperFromOrderDate.mockResolvedValue(
      generatedPaper,
    );
    paperRepository.getActiveGroups.mockResolvedValue(groups);
    paperRepository.generateOrderSheets.mockResolvedValue({
      count: groups.length,
    });
  });

  describe('generatePaperService', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });
    it('throws when date is missing', async () => {
      await expect(service.generatePaperService('')).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.MISSING_REQUIRED_FIELD('date')),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when date format is invalid', async () => {
      await expect(
        service.generatePaperService('invalid-date'),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when date is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const date = pastDate.toISOString().slice(0, 10);

      await expect(service.generatePaperService(date)).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAST_DATE_NOT_ALLOWED),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when date is more than the configured maximum future days ahead', async () => {
      const futureDate = new Date();
      futureDate.setDate(
        futureDate.getDate() + DATE_CONFIG.MAX_FUTURE_DAYS + 1,
      );

      const date = futureDate.toISOString().slice(0, 10);

      await expect(service.generatePaperService(date)).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.FUTURE_DATE_TOO_FAR(DATE_CONFIG.MAX_FUTURE_DAYS),
        ),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns the existing paper without generating a new paper or sheets', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(existingPaper);

      const result = await service.generatePaperService('2026-09-10');

      expect(result).toBe(existingPaper);

      expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledTimes(1);

      expect(paperRepository.generatePaperFromOrderDate).not.toHaveBeenCalled();
      expect(paperRepository.getActiveGroups).not.toHaveBeenCalled();
      expect(paperRepository.generateOrderSheets).not.toHaveBeenCalled();
    });

    it('generates a paper and order sheets when no paper exists and active groups are available', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(null);

      const result = await service.generatePaperService('2026-09-10');

      expect(result).toBe(generatedPaper);

      expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledWith(
        new Date('2026-09-10T00:00:00.000Z'),
        new Date('2026-09-11T00:00:00.000Z'),
        db,
      );

      expect(paperRepository.generatePaperFromOrderDate).toHaveBeenCalledWith(
        new Date('2026-09-09T00:00:00.000Z'),
        db,
      );

      expect(paperRepository.getActiveGroups).toHaveBeenCalledWith(db);

      expect(paperRepository.generateOrderSheets).toHaveBeenCalledWith(
        generatedPaper.id,
        groups,
        db,
      );
    });

    it('throws when no active groups exist', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(null);
      paperRepository.getActiveGroups.mockResolvedValue([]);

      await expect(service.generatePaperService('2026-09-10')).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.NO_ACTIVE_GROUPS),
      );

      expect(paperRepository.generatePaperFromOrderDate).toHaveBeenCalled();
      expect(paperRepository.generateOrderSheets).not.toHaveBeenCalled();
    });

    it('propagates transaction errors', async () => {
      const error = new Error('database failure');

      prisma.$transaction.mockRejectedValue(error);

      await expect(service.generatePaperService('2026-09-10')).rejects.toBe(
        error,
      );
    });

    it('allows a sale date exactly MAX_FUTURE_DAYS ahead', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + DATE_CONFIG.MAX_FUTURE_DAYS);

      const date = futureDate.toISOString().slice(0, 10);

      paperRepository.findPaperBySaleDate.mockResolvedValue(null);

      await service.generatePaperService(date);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('allows a sale date equal to today', async () => {
      const today = new Date().toISOString().slice(0, 10);

      paperRepository.findPaperBySaleDate.mockResolvedValue(null);

      await service.generatePaperService(today);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    describe('IST vs UTC boundary (regression guard for §7.4)', () => {
      // 2026-09-10T19:00:00.000Z is 2026-09-11 00:30 IST (UTC+5:30): "today" in IST is
      // the 11th, but "today" in raw UTC is still the 10th. If the service ever regressed
      // to computing "today" from UTC instead of IST, both assertions below would flip.
      const fixedNowUtc = new Date('2026-09-10T19:00:00.000Z');

      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(fixedNowUtc);
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('rejects a date that is "today" by UTC but already "yesterday" by IST', async () => {
        await expect(
          service.generatePaperService('2026-09-10'),
        ).rejects.toThrow(
          new BadRequestException(ERROR_MESSAGES.PAST_DATE_NOT_ALLOWED),
        );

        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('allows the date that is actually "today" by IST', async () => {
        paperRepository.findPaperBySaleDate.mockResolvedValue(null);

        await service.generatePaperService('2026-09-11');

        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });

    describe('P2002 race recovery (concurrent duplicate-date generation)', () => {
      it('returns the winning paper when the transaction fails with P2002', async () => {
        const p2002Error = Object.assign(
          new Error('Unique constraint failed on the fields: (`sale_date`)'),
          { code: 'P2002' },
        );

        prisma.$transaction.mockRejectedValue(p2002Error);
        paperRepository.findPaperBySaleDate.mockResolvedValue(existingPaper);

        const result = await service.generatePaperService('2026-09-10');

        expect(result).toBe(existingPaper);

        // The refetch happens outside the failed transaction (no tx arg).
        expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledWith(
          new Date('2026-09-10T00:00:00.000Z'),
          new Date('2026-09-11T00:00:00.000Z'),
        );

        expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledTimes(1);
      });

      it('rethrows the original P2002 error when the refetch finds no paper', async () => {
        const p2002Error = Object.assign(
          new Error('Unique constraint failed on the fields: (`sale_date`)'),
          { code: 'P2002' },
        );

        prisma.$transaction.mockRejectedValue(p2002Error);
        paperRepository.findPaperBySaleDate.mockResolvedValue(null);

        await expect(service.generatePaperService('2026-09-10')).rejects.toBe(
          p2002Error,
        );
      });

      it('rethrows non-P2002 transaction errors without attempting a refetch', async () => {
        const error = Object.assign(new Error('connection reset'), {
          code: 'P1001',
        });

        prisma.$transaction.mockRejectedValue(error);

        await expect(service.generatePaperService('2026-09-10')).rejects.toBe(
          error,
        );

        expect(paperRepository.findPaperBySaleDate).not.toHaveBeenCalled();
      });

      it('rethrows errors with no error code without attempting a refetch', async () => {
        const error = new Error('unexpected failure');

        prisma.$transaction.mockRejectedValue(error);

        await expect(service.generatePaperService('2026-09-10')).rejects.toBe(
          error,
        );

        expect(paperRepository.findPaperBySaleDate).not.toHaveBeenCalled();
      });
    });
  });

  describe('getTodayPaperService', () => {
    it('returns today paper when one exists', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(existingPaper);

      const result = await service.getTodayPaperService();

      expect(result).toEqual({
        type: 'TODAY',
        paper: existingPaper,
      });

      expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledTimes(1);

      expect(paperRepository.findLatestPaper).not.toHaveBeenCalled();
    });

    it('returns the latest paper when today paper does not exist', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(null);
      paperRepository.findLatestPaper.mockResolvedValue(existingPaper);

      const result = await service.getTodayPaperService();

      expect(result).toEqual({
        type: 'LATEST',
        paper: existingPaper,
      });

      expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledTimes(1);
      expect(paperRepository.findLatestPaper).toHaveBeenCalledTimes(1);
    });

    it('throws when neither today nor latest paper exists', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(null);
      paperRepository.findLatestPaper.mockResolvedValue(null);

      await expect(service.getTodayPaperService()).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.NO_PAPERS_FOUND),
      );

      expect(paperRepository.findLatestPaper).toHaveBeenCalledTimes(1);
    });

    it('propagates repository errors', async () => {
      const error = new Error('database failure');

      paperRepository.findPaperBySaleDate.mockRejectedValue(error);

      await expect(service.getTodayPaperService()).rejects.toBe(error);

      expect(paperRepository.findLatestPaper).not.toHaveBeenCalled();
    });
  });

  describe('getPaperByIdService', () => {
    it('returns the paper when it exists', async () => {
      paperRepository.findPaperById.mockResolvedValue(existingPaper);

      const result = await service.getPaperByIdService(1);

      expect(result).toBe(existingPaper);
      expect(paperRepository.findPaperById).toHaveBeenCalledWith(1);
    });

    it('throws when the paper does not exist', async () => {
      paperRepository.findPaperById.mockResolvedValue(null);

      await expect(service.getPaperByIdService(999)).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND),
      );

      expect(paperRepository.findPaperById).toHaveBeenCalledWith(999);
    });

    it('propagates repository errors', async () => {
      const error = new Error('database failure');

      paperRepository.findPaperById.mockRejectedValue(error);

      await expect(service.getPaperByIdService(1)).rejects.toBe(error);
    });
  });

  describe('getPapersService', () => {
    it('returns all papers when no date is supplied', async () => {
      const papers = [existingPaper, generatedPaper];

      paperRepository.findAllPapers.mockResolvedValue(papers);

      const result = await service.getPapersService();

      expect(result).toBe(papers);
      expect(paperRepository.findAllPapers).toHaveBeenCalledTimes(1);
      expect(paperRepository.findPaperBySaleDate).not.toHaveBeenCalled();
    });

    it('returns the paper for the supplied date', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(existingPaper);

      const result = await service.getPapersService('2026-09-10');

      expect(result).toBe(existingPaper);

      expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledWith(
        new Date('2026-09-10T00:00:00.000Z'),
        new Date('2026-09-11T00:00:00.000Z'),
      );

      expect(paperRepository.findAllPapers).not.toHaveBeenCalled();
    });

    it('throws when the supplied date has an invalid format', async () => {
      await expect(service.getPapersService('invalid-date')).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT),
      );

      expect(paperRepository.findPaperBySaleDate).not.toHaveBeenCalled();

      expect(paperRepository.findAllPapers).not.toHaveBeenCalled();
    });

    it('throws when no paper exists for the supplied date', async () => {
      paperRepository.findPaperBySaleDate.mockResolvedValue(null);

      await expect(service.getPapersService('2026-09-10')).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND),
      );

      expect(paperRepository.findPaperBySaleDate).toHaveBeenCalledTimes(1);
    });

    it('propagates repository errors when fetching by date', async () => {
      const error = new Error('database failure');

      paperRepository.findPaperBySaleDate.mockRejectedValue(error);

      await expect(service.getPapersService('2026-09-10')).rejects.toBe(error);
    });

    it('propagates repository errors when fetching all papers', async () => {
      const error = new Error('database failure');

      paperRepository.findAllPapers.mockRejectedValue(error);

      await expect(service.getPapersService()).rejects.toBe(error);
    });
  });
  describe('submitNightEntryService', () => {
    it('validates readiness, validates the transition, and submits the night entry', async () => {
      paperValidationService.validateNightSubmitReadiness.mockResolvedValue(
        draftPaper,
      );
      paperRepository.submitNightEntry.mockResolvedValue({
        ...draftPaper,
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      });

      const result = await service.submitNightEntryService(1);

      expect(
        paperValidationService.validateNightSubmitReadiness,
      ).toHaveBeenCalledWith(1, db);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.DRAFT,
        OrderPaperStatus.NIGHT_SUBMITTED,
      );

      expect(paperRepository.submitNightEntry).toHaveBeenCalledWith(1, db);

      expect(result).toEqual({
        ...draftPaper,
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      });
    });

    it('passes the transaction object through the entire operation', async () => {
      paperValidationService.validateNightSubmitReadiness.mockResolvedValue(
        draftPaper,
      );

      await service.submitNightEntryService(1);

      expect(
        paperValidationService.validateNightSubmitReadiness,
      ).toHaveBeenCalledWith(1, db);

      expect(paperRepository.submitNightEntry).toHaveBeenCalledWith(1, db);
    });

    it('does not submit when readiness validation fails', async () => {
      const error = new Error('night readiness failed');

      paperValidationService.validateNightSubmitReadiness.mockRejectedValue(
        error,
      );

      await expect(service.submitNightEntryService(1)).rejects.toBe(error);

      expect(workflowState.validateTransition).not.toHaveBeenCalled();
      expect(paperRepository.submitNightEntry).not.toHaveBeenCalled();
    });

    it('does not submit when the workflow transition is invalid', async () => {
      paperValidationService.validateNightSubmitReadiness.mockResolvedValue(
        nightSubmittedPaper,
      );

      const error = new BadRequestException('invalid transition');

      workflowState.validateTransition.mockImplementation(() => {
        throw error;
      });

      await expect(service.submitNightEntryService(1)).rejects.toBe(error);

      expect(paperRepository.submitNightEntry).not.toHaveBeenCalled();
    });
  });

  describe('submitMorningEntryService', () => {
    it('validates readiness, validates the transition, and submits the morning entry', async () => {
      paperValidationService.validateMorningSubmitReadiness.mockResolvedValue(
        nightSubmittedPaper,
      );
      paperRepository.submitMorningEntry.mockResolvedValue({
        ...nightSubmittedPaper,
        status: OrderPaperStatus.MORNING_SUBMITTED,
      });

      const result = await service.submitMorningEntryService(1);

      expect(
        paperValidationService.validateMorningSubmitReadiness,
      ).toHaveBeenCalledWith(1, db);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.NIGHT_SUBMITTED,
        OrderPaperStatus.MORNING_SUBMITTED,
      );

      expect(paperRepository.submitMorningEntry).toHaveBeenCalledWith(1, db);

      expect(result).toEqual({
        ...nightSubmittedPaper,
        status: OrderPaperStatus.MORNING_SUBMITTED,
      });
    });

    it('passes the transaction object through the entire operation', async () => {
      paperValidationService.validateMorningSubmitReadiness.mockResolvedValue(
        nightSubmittedPaper,
      );

      await service.submitMorningEntryService(1);

      expect(
        paperValidationService.validateMorningSubmitReadiness,
      ).toHaveBeenCalledWith(1, db);

      expect(paperRepository.submitMorningEntry).toHaveBeenCalledWith(1, db);
    });

    it('does not submit when readiness validation fails', async () => {
      const error = new Error('morning readiness failed');

      paperValidationService.validateMorningSubmitReadiness.mockRejectedValue(
        error,
      );

      await expect(service.submitMorningEntryService(1)).rejects.toBe(error);

      expect(workflowState.validateTransition).not.toHaveBeenCalled();
      expect(paperRepository.submitMorningEntry).not.toHaveBeenCalled();
    });

    it('does not submit when the workflow transition is invalid', async () => {
      paperValidationService.validateMorningSubmitReadiness.mockResolvedValue(
        draftPaper,
      );

      const error = new BadRequestException('invalid transition');

      workflowState.validateTransition.mockImplementation(() => {
        throw error;
      });

      await expect(service.submitMorningEntryService(1)).rejects.toBe(error);

      expect(paperRepository.submitMorningEntry).not.toHaveBeenCalled();
    });
  });

  describe('finalizePaperService', () => {
    it('validates readiness, validates the transition, executes dependencies, and finalizes the paper', async () => {
      paperValidationService.validateFinalizeReadiness.mockResolvedValue(
        morningSubmittedPaper,
      );
      paperRepository.finalizePaper.mockResolvedValue({
        ...morningSubmittedPaper,
        status: OrderPaperStatus.FINALIZED,
      });

      const result = await service.finalizePaperService(1);

      expect(
        paperValidationService.validateFinalizeReadiness,
      ).toHaveBeenCalledWith(1, db);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.MORNING_SUBMITTED,
        OrderPaperStatus.FINALIZED,
      );

      expect(dependencyOrchestrator.execute).toHaveBeenCalledWith(
        DEPENDENCY_MODULES.PAPER,
        DEPENDENCY_TRIGGERS.ON_FINALIZE,
        {
          paperId: 1,
          tx: db,
        },
      );

      expect(paperRepository.finalizePaper).toHaveBeenCalledWith(1, db);

      expect(result).toEqual({
        ...morningSubmittedPaper,
        status: OrderPaperStatus.FINALIZED,
      });
    });

    it('executes dependency propagation before finalizing the paper status', async () => {
      paperValidationService.validateFinalizeReadiness.mockResolvedValue(
        morningSubmittedPaper,
      );

      const calls: string[] = [];

      dependencyOrchestrator.execute.mockImplementation(async () => {
        calls.push('dependency');
      });

      paperRepository.finalizePaper.mockImplementation(async () => {
        calls.push('finalize');
        return {
          ...morningSubmittedPaper,
          status: OrderPaperStatus.FINALIZED,
        };
      });

      await service.finalizePaperService(1);

      expect(calls).toEqual(['dependency', 'finalize']);
    });

    it('passes the transaction object to readiness validation and finalization', async () => {
      paperValidationService.validateFinalizeReadiness.mockResolvedValue(
        morningSubmittedPaper,
      );

      await service.finalizePaperService(1);

      expect(
        paperValidationService.validateFinalizeReadiness,
      ).toHaveBeenCalledWith(1, db);

      expect(paperRepository.finalizePaper).toHaveBeenCalledWith(1, db);

      expect(dependencyOrchestrator.execute).toHaveBeenCalledWith(
        DEPENDENCY_MODULES.PAPER,
        DEPENDENCY_TRIGGERS.ON_FINALIZE,
        {
          paperId: 1,
          tx: db,
        },
      );
    });

    it('does not finalize when readiness validation fails', async () => {
      const error = new Error('finalize readiness failed');

      paperValidationService.validateFinalizeReadiness.mockRejectedValue(error);

      await expect(service.finalizePaperService(1)).rejects.toBe(error);

      expect(workflowState.validateTransition).not.toHaveBeenCalled();
      expect(dependencyOrchestrator.execute).not.toHaveBeenCalled();
      expect(paperRepository.finalizePaper).not.toHaveBeenCalled();
    });

    it('does not finalize when the workflow transition is invalid', async () => {
      paperValidationService.validateFinalizeReadiness.mockResolvedValue(
        reopenedPaper,
      );

      const error = new BadRequestException('invalid transition');

      workflowState.validateTransition.mockImplementation(() => {
        throw error;
      });

      await expect(service.finalizePaperService(1)).rejects.toBe(error);

      expect(dependencyOrchestrator.execute).not.toHaveBeenCalled();
      expect(paperRepository.finalizePaper).not.toHaveBeenCalled();
    });

    it('does not finalize when dependency propagation fails', async () => {
      paperValidationService.validateFinalizeReadiness.mockResolvedValue(
        morningSubmittedPaper,
      );

      const error = new Error('dependency propagation failed');

      dependencyOrchestrator.execute.mockRejectedValue(error);

      await expect(service.finalizePaperService(1)).rejects.toBe(error);

      expect(paperRepository.finalizePaper).not.toHaveBeenCalled();
    });

    it.each([OrderPaperStatus.MORNING_SUBMITTED, OrderPaperStatus.REOPENED])(
      'allows finalization readiness for %s',
      async (status) => {
        const paper =
          status === OrderPaperStatus.MORNING_SUBMITTED
            ? morningSubmittedPaper
            : reopenedPaper;

        paperValidationService.validateFinalizeReadiness.mockResolvedValue(
          paper,
        );

        await service.finalizePaperService(1);

        expect(workflowState.validateTransition).toHaveBeenCalledWith(
          status,
          OrderPaperStatus.FINALIZED,
        );
      },
    );
  });

  describe('reopenPaperService', () => {
    it('finds the paper, validates the transition, and reopens it', async () => {
      paperRepository.findPaperById.mockResolvedValue(finalizedPaper);
      paperRepository.reopenPaper.mockResolvedValue({
        ...finalizedPaper,
        status: OrderPaperStatus.REOPENED,
      });

      const result = await service.reopenPaperService(1, 'Correction required');

      expect(paperRepository.findPaperById).toHaveBeenCalledWith(1, db);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.FINALIZED,
        OrderPaperStatus.REOPENED,
      );

      expect(paperRepository.reopenPaper).toHaveBeenCalledWith(
        1,
        'Correction required',
        db,
      );

      expect(result).toEqual({
        ...finalizedPaper,
        status: OrderPaperStatus.REOPENED,
      });
    });

    it('passes the transaction object to the lookup and update', async () => {
      paperRepository.findPaperById.mockResolvedValue(existingPaper);

      await service.reopenPaperService(1, 'Correction required');

      expect(paperRepository.findPaperById).toHaveBeenCalledWith(1, db);

      expect(paperRepository.reopenPaper).toHaveBeenCalledWith(
        1,
        'Correction required',
        db,
      );
    });

    it('throws when the paper does not exist', async () => {
      paperRepository.findPaperById.mockResolvedValue(null);

      await expect(
        service.reopenPaperService(1, 'Correction required'),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND),
      );

      expect(workflowState.validateTransition).not.toHaveBeenCalled();
      expect(paperRepository.reopenPaper).not.toHaveBeenCalled();
    });

    it('does not reopen when the workflow transition is invalid', async () => {
      paperRepository.findPaperById.mockResolvedValue(draftPaper);

      const error = new BadRequestException('invalid transition');

      workflowState.validateTransition.mockImplementation(() => {
        throw error;
      });

      await expect(
        service.reopenPaperService(1, 'Correction required'),
      ).rejects.toBe(error);

      expect(paperRepository.reopenPaper).not.toHaveBeenCalled();
    });

    it('persists the supplied reopen reason', async () => {
      paperRepository.findPaperById.mockResolvedValue(existingPaper);

      await service.reopenPaperService(1, 'Admin correction requested');

      expect(paperRepository.reopenPaper).toHaveBeenCalledWith(
        1,
        'Admin correction requested',
        db,
      );
    });

    // Plan §8 ambiguity D: PaperController's @Body('reason') has no @IsNotEmpty / DTO
    // validation, so an empty-string reason is currently accepted rather than rejected.
    // This test pins that observed behavior pending product/business sign-off — it is not
    // an endorsement that empty reasons *should* be allowed.
    it('currently accepts an empty-string reopen reason (unenforced — see plan §8 ambiguity D)', async () => {
      paperRepository.findPaperById.mockResolvedValue(existingPaper);

      await service.reopenPaperService(1, '');

      expect(paperRepository.reopenPaper).toHaveBeenCalledWith(1, '', db);
    });

    it('does not execute dependency propagation when reopening', async () => {
      paperRepository.findPaperById.mockResolvedValue(finalizedPaper);
      paperRepository.reopenPaper.mockResolvedValue({
        ...finalizedPaper,
        status: OrderPaperStatus.REOPENED,
      });

      await service.reopenPaperService(1, 'Correction required');

      expect(dependencyOrchestrator.execute).not.toHaveBeenCalled();
    });
  });
});
