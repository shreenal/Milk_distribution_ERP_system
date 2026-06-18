import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { PaperService } from './paper.service.js';
import { DATE_CONFIG } from './paper.constants.js';
import { OrderPaperStatus } from '../../generated/prisma/client.js';

describe('PaperService', () => {
  let service: PaperService;

  const paperRepository = {
    findOrderPaper: vi.fn(),
    generateOrderPaper: vi.fn(),
    getActiveGroups: vi.fn(),
    generateOrderSheets: vi.fn(),
    findTodayPaper: vi.fn(),
    findLatestPaper: vi.fn(),
    submitNightEntry: vi.fn(),
    submitMorningEntry: vi.fn(),
    finalizePaper: vi.fn(),
    findPaperById: vi.fn(),
    reopenPaper: vi.fn(),
    getPaperSheets: vi.fn(),
    getSheetItems: vi.fn(),
  };

  const paperValidationService = {
    validateNightSubmitReadiness: vi.fn(),
    validateMorningSubmitReadiness: vi.fn(),
    validateFinalizeReadiness: vi.fn(),
  };

  const workflowState = {
    validateTransition: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new PaperService(
      paperRepository as any,
      paperValidationService as any,
      workflowState as any,
    );
  });

  describe('generatePaperService', () => {
    it('should throw when date is missing', async () => {
      await expect(service.generatePaperService('' as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for invalid date format', async () => {
      await expect(
        service.generatePaperService('invalid-date'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for past date', async () => {
      await expect(service.generatePaperService('2020-01-01')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when date is too far in future', async () => {
      const futureDate = new Date();
      futureDate.setDate(
        futureDate.getDate() + DATE_CONFIG.MAX_FUTURE_DAYS + 10,
      );

      await expect(
        service.generatePaperService(futureDate.toISOString().split('T')[0]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return existing paper if found', async () => {
      const paper = { id: 1, status: 'DRAFT' };

      paperRepository.findOrderPaper.mockResolvedValue(paper);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const result = await service.generatePaperService(
        futureDate.toISOString().split('T')[0],
      );

      expect(result).toEqual(paper);
      expect(paperRepository.generateOrderPaper).not.toHaveBeenCalled();
    });

    it('should throw when no active groups found', async () => {
      paperRepository.findOrderPaper.mockResolvedValue(null);
      paperRepository.generateOrderPaper.mockResolvedValue({ id: 1 });
      paperRepository.getActiveGroups.mockResolvedValue([]);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await expect(
        service.generatePaperService(futureDate.toISOString().split('T')[0]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate paper successfully with sheets', async () => {
      const paper = { id: 1, status: 'DRAFT' };

      paperRepository.findOrderPaper.mockResolvedValue(null);
      paperRepository.generateOrderPaper.mockResolvedValue(paper);
      paperRepository.getActiveGroups.mockResolvedValue([
        { id: 1, name: 'Group A' },
        { id: 2, name: 'Group B' },
      ]);
      paperRepository.generateOrderSheets.mockResolvedValue({
        count: 2,
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const result = await service.generatePaperService(
        futureDate.toISOString().split('T')[0],
      );

      expect(result).toEqual(paper);
      expect(paperRepository.generateOrderSheets).toHaveBeenCalledWith(1, [
        { id: 1, name: 'Group A' },
        { id: 2, name: 'Group B' },
      ]);
    });

    it('should accept date exactly 30 days in future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + DATE_CONFIG.MAX_FUTURE_DAYS);

      paperRepository.findOrderPaper.mockResolvedValue(null);
      paperRepository.generateOrderPaper.mockResolvedValue({ id: 1 });
      paperRepository.getActiveGroups.mockResolvedValue([{ id: 1 }]);
      paperRepository.generateOrderSheets.mockResolvedValue({});

      const result = await service.generatePaperService(
        futureDate.toISOString().split('T')[0],
      );

      expect(result).toBeDefined();
    });
  });

  describe('getTodayPaperService', () => {
    it('should return today paper when found', async () => {
      const paper = { id: 1, status: 'DRAFT' };

      paperRepository.findTodayPaper.mockResolvedValue(paper);

      const result = await service.getTodayPaperService();

      expect(result).toEqual({
        type: 'TODAY',
        paper,
      });
    });

    it('should return latest paper when today paper not found', async () => {
      const paper = { id: 2, status: 'NIGHT_SUBMITTED' };

      paperRepository.findTodayPaper.mockResolvedValue(null);
      paperRepository.findLatestPaper.mockResolvedValue(paper);

      const result = await service.getTodayPaperService();

      expect(result).toEqual({
        type: 'LATEST',
        paper,
      });
    });

    it('should throw when no papers exist', async () => {
      paperRepository.findTodayPaper.mockResolvedValue(null);
      paperRepository.findLatestPaper.mockResolvedValue(null);

      await expect(service.getTodayPaperService()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submitNightEntryService', () => {
    it('should submit night entry after validation', async () => {
      const paper = { id: 1, status: OrderPaperStatus.DRAFT };

      paperValidationService.validateNightSubmitReadiness.mockResolvedValue(
        paper,
      );
      paperRepository.submitNightEntry.mockResolvedValue({
        id: 1,
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      });

      const result = await service.submitNightEntryService(1);

      expect(
        paperValidationService.validateNightSubmitReadiness,
      ).toHaveBeenCalledWith(1);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.DRAFT,
        OrderPaperStatus.NIGHT_SUBMITTED,
      );

      expect(paperRepository.submitNightEntry).toHaveBeenCalledWith(1);

      expect(result.status).toBe(OrderPaperStatus.NIGHT_SUBMITTED);
    });

    it('should throw if validation fails', async () => {
      paperValidationService.validateNightSubmitReadiness.mockRejectedValue(
        new BadRequestException('Validation failed'),
      );

      await expect(service.submitNightEntryService(1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submitMorningEntryService', () => {
    it('should submit morning entry after validation', async () => {
      const paper = { id: 1, status: OrderPaperStatus.NIGHT_SUBMITTED };

      paperValidationService.validateMorningSubmitReadiness.mockResolvedValue(
        paper,
      );
      paperRepository.submitMorningEntry.mockResolvedValue({
        id: 1,
        status: OrderPaperStatus.MORNING_SUBMITTED,
      });

      const result = await service.submitMorningEntryService(1);

      expect(
        paperValidationService.validateMorningSubmitReadiness,
      ).toHaveBeenCalledWith(1);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.NIGHT_SUBMITTED,
        OrderPaperStatus.MORNING_SUBMITTED,
      );

      expect(result.status).toBe(OrderPaperStatus.MORNING_SUBMITTED);
    });

    it('should throw if validation fails', async () => {
      paperValidationService.validateMorningSubmitReadiness.mockRejectedValue(
        new BadRequestException('Validation failed'),
      );

      await expect(service.submitMorningEntryService(1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('finalizePaperService', () => {
    it('should finalize paper after validation', async () => {
      const paper = { id: 1, status: OrderPaperStatus.MORNING_SUBMITTED };

      paperValidationService.validateFinalizeReadiness.mockResolvedValue(paper);
      paperRepository.finalizePaper.mockResolvedValue({
        id: 1,
        status: OrderPaperStatus.FINALIZED,
      });

      const result = await service.finalizePaperService(1);

      expect(
        paperValidationService.validateFinalizeReadiness,
      ).toHaveBeenCalledWith(1);

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.MORNING_SUBMITTED,
        OrderPaperStatus.FINALIZED,
      );

      expect(result.status).toBe(OrderPaperStatus.FINALIZED);
    });

    it('should throw if validation fails', async () => {
      paperValidationService.validateFinalizeReadiness.mockRejectedValue(
        new BadRequestException('Validation failed'),
      );

      await expect(service.finalizePaperService(1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reopenPaperService', () => {
    it('should throw when paper does not exist', async () => {
      paperRepository.findPaperById.mockResolvedValue(null);

      await expect(
        service.reopenPaperService(1, 'Correction required'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reopen paper with reason', async () => {
      const paper = { id: 1, status: OrderPaperStatus.FINALIZED };

      paperRepository.findPaperById.mockResolvedValue(paper);
      paperRepository.reopenPaper.mockResolvedValue({
        id: 1,
        status: OrderPaperStatus.REOPENED,
        reopen_reason: 'Correction required',
      });

      const result = await service.reopenPaperService(1, 'Correction required');

      expect(workflowState.validateTransition).toHaveBeenCalledWith(
        OrderPaperStatus.FINALIZED,
        OrderPaperStatus.REOPENED,
      );

      expect(paperRepository.reopenPaper).toHaveBeenCalledWith(
        1,
        'Correction required',
      );

      expect(result.status).toBe(OrderPaperStatus.REOPENED);
      expect(result.reopen_reason).toBe('Correction required');
    });

    it('should throw for invalid status transition', async () => {
      const paper = { id: 1, status: OrderPaperStatus.DRAFT };

      paperRepository.findPaperById.mockResolvedValue(paper);
      workflowState.validateTransition.mockImplementation(() => {
        throw new BadRequestException('Invalid transition');
      });

      await expect(service.reopenPaperService(1, 'Reason')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
