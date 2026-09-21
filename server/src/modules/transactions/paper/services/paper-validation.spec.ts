import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaperValidationService } from './paper-validation.service.js';
import { ERROR_MESSAGES } from '../paper.constants.js';
import { OrderPaperStatus } from '../../../../generated/prisma/client.js';

describe('PaperValidationService', () => {
  const paperRepository = {
    findPaperById: vi.fn(),
    getPaperSheets: vi.fn(),
  };

  const workflowState = {};

  const ordersValidationService = {
    validateNightEntriesComplete: vi.fn(),
    validateMorningEntriesComplete: vi.fn(),
    validateQuantitySanity: vi.fn(),
  };

  const vehicleAllocationValidationService = {
    validateVehicleAllocationsForNightSubmit: vi.fn(),
    validateVehicleAssignmentsForNightSubmit: vi.fn(),
    validateVehicleAllocationsForMorningSubmit: vi.fn(),
    validateVehicleAssignmentsForMorningSubmit: vi.fn(),
  };

  const clienttraysValidationService = {
    validateTrayCalculationExists: vi.fn(),
    validateTrayCompleteness: vi.fn(),
  };

  const collectionsValidationService = {
    validateNightCollections: vi.fn(),
    validateMorningCollections: vi.fn(),
    validateAdminCollections: vi.fn(),
  };

  const purchaseValidationService = {
    validatePurchasesComplete: vi.fn(),
  };

  const cashSettlementValidationService = {
    validateMorningSubmitReadiness: vi.fn(),
    validateReconciliationOnFinalize: vi.fn(),
  };

  const dairyTraysValidationService = {
    validateDairyTraysComplete: vi.fn(),
  };

  const distributorTransferValidationService = {
    validateGenerationReadiness: vi.fn(),
  };

  let service: PaperValidationService;

  const db = {} as any;

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

  const sheets = [
    {
      id: 101,
      master_group: {
        name: 'Group 1',
      },
    },
    {
      id: 102,
      master_group: {
        name: 'Group 2',
      },
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    service = new PaperValidationService(
      paperRepository as any,
      workflowState as any,
      ordersValidationService as any,
      vehicleAllocationValidationService as any,
      clienttraysValidationService as any,
      collectionsValidationService as any,
      purchaseValidationService as any,
      cashSettlementValidationService as any,
      dairyTraysValidationService as any,
      distributorTransferValidationService as any,
    );

    paperRepository.findPaperById.mockResolvedValue(draftPaper);
    paperRepository.getPaperSheets.mockResolvedValue(sheets);
  });

  describe('validateNightSubmitReadiness', () => {
    it('throws when paper does not exist', async () => {
      paperRepository.findPaperById.mockResolvedValue(null);

      await expect(service.validateNightSubmitReadiness(1, db)).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND),
      );

      expect(paperRepository.findPaperById).toHaveBeenCalledWith(1, db);
      expect(paperRepository.getPaperSheets).not.toHaveBeenCalled();
    });

    it('throws when paper is not in DRAFT status', async () => {
      paperRepository.findPaperById.mockResolvedValue({
        ...draftPaper,
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      });

      await expect(service.validateNightSubmitReadiness(1, db)).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_IN_DRAFT_STATUS),
      );

      expect(paperRepository.getPaperSheets).not.toHaveBeenCalled();
    });

    it('validates all sheets and paper-level night readiness checks', async () => {
      const result = await service.validateNightSubmitReadiness(1, db);

      expect(result).toBe(draftPaper);

      expect(
        ordersValidationService.validateNightEntriesComplete,
      ).toHaveBeenNthCalledWith(1, 101, 'Group 1', db);

      expect(
        ordersValidationService.validateNightEntriesComplete,
      ).toHaveBeenNthCalledWith(2, 102, 'Group 2', db);

      expect(
        clienttraysValidationService.validateTrayCalculationExists,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        clienttraysValidationService.validateTrayCalculationExists,
      ).toHaveBeenNthCalledWith(2, 102, db);

      expect(
        collectionsValidationService.validateNightCollections,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        collectionsValidationService.validateNightCollections,
      ).toHaveBeenNthCalledWith(2, 102, db);

      expect(
        vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit,
      ).toHaveBeenCalledWith(1, db);

      expect(
        vehicleAllocationValidationService.validateVehicleAssignmentsForNightSubmit,
      ).toHaveBeenCalledWith(1, db);

      expect(
        distributorTransferValidationService.validateGenerationReadiness,
      ).toHaveBeenCalledWith(1, db);
    });

    it('validates each sheet in the required order', async () => {
      const calls: string[] = [];

      ordersValidationService.validateNightEntriesComplete.mockImplementation(
        async () => {
          calls.push('orders');
        },
      );

      clienttraysValidationService.validateTrayCalculationExists.mockImplementation(
        async () => {
          calls.push('trays');
        },
      );

      collectionsValidationService.validateNightCollections.mockImplementation(
        async () => {
          calls.push('collections');
        },
      );

      vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit.mockImplementation(
        async () => {
          calls.push('vehicle-allocations');
        },
      );

      vehicleAllocationValidationService.validateVehicleAssignmentsForNightSubmit.mockImplementation(
        async () => {
          calls.push('vehicle-assignments');
        },
      );

      distributorTransferValidationService.validateGenerationReadiness.mockImplementation(
        async () => {
          calls.push('distributor-transfer');
        },
      );

      await service.validateNightSubmitReadiness(1, db);

      expect(calls).toEqual([
        'orders',
        'trays',
        'collections',
        'orders',
        'trays',
        'collections',
        'vehicle-allocations',
        'vehicle-assignments',
        'distributor-transfer',
      ]);
    });

    it('passes the transaction object to every validator', async () => {
      await service.validateNightSubmitReadiness(1, db);

      for (const sheet of sheets) {
        expect(
          ordersValidationService.validateNightEntriesComplete,
        ).toHaveBeenCalledWith(sheet.id, sheet.master_group.name, db);

        expect(
          clienttraysValidationService.validateTrayCalculationExists,
        ).toHaveBeenCalledWith(sheet.id, db);

        expect(
          collectionsValidationService.validateNightCollections,
        ).toHaveBeenCalledWith(sheet.id, db);
      }

      expect(
        vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit,
      ).toHaveBeenCalledWith(1, db);

      expect(
        vehicleAllocationValidationService.validateVehicleAssignmentsForNightSubmit,
      ).toHaveBeenCalledWith(1, db);

      expect(
        distributorTransferValidationService.validateGenerationReadiness,
      ).toHaveBeenCalledWith(1, db);
    });

    it('stops validation when a sheet-level validator fails', async () => {
      const error = new Error('night order validation failed');

      ordersValidationService.validateNightEntriesComplete.mockRejectedValueOnce(
        error,
      );

      await expect(service.validateNightSubmitReadiness(1, db)).rejects.toBe(
        error,
      );

      expect(
        clienttraysValidationService.validateTrayCalculationExists,
      ).not.toHaveBeenCalled();

      expect(
        collectionsValidationService.validateNightCollections,
      ).not.toHaveBeenCalled();

      expect(
        vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit,
      ).not.toHaveBeenCalled();

      expect(
        vehicleAllocationValidationService.validateVehicleAssignmentsForNightSubmit,
      ).not.toHaveBeenCalled();

      expect(
        distributorTransferValidationService.validateGenerationReadiness,
      ).not.toHaveBeenCalled();
    });

    it('returns the paper when all validations pass', async () => {
      await expect(service.validateNightSubmitReadiness(1, db)).resolves.toBe(
        draftPaper,
      );
    });
  });

  describe('validateMorningSubmitReadiness', () => {
    beforeEach(() => {
      paperRepository.findPaperById.mockResolvedValue(nightSubmittedPaper);
    });

    it('throws when paper does not exist', async () => {
      paperRepository.findPaperById.mockResolvedValue(null);

      await expect(
        service.validateMorningSubmitReadiness(1, db),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND),
      );

      expect(paperRepository.getPaperSheets).not.toHaveBeenCalled();
    });

    it('throws when paper is not in NIGHT_SUBMITTED status', async () => {
      paperRepository.findPaperById.mockResolvedValue(draftPaper);

      await expect(
        service.validateMorningSubmitReadiness(1, db),
      ).rejects.toThrow(
        ERROR_MESSAGES.INVALID_STATUS_TRANSITION(
          OrderPaperStatus.DRAFT,
          OrderPaperStatus.MORNING_SUBMITTED,
        ),
      );

      expect(paperRepository.getPaperSheets).not.toHaveBeenCalled();
    });

    it('validates all sheets and paper-level morning readiness checks', async () => {
      const result = await service.validateMorningSubmitReadiness(1, db);

      expect(result).toBe(nightSubmittedPaper);

      expect(
        ordersValidationService.validateMorningEntriesComplete,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        ordersValidationService.validateMorningEntriesComplete,
      ).toHaveBeenNthCalledWith(2, 102, db);

      expect(
        ordersValidationService.validateQuantitySanity,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        ordersValidationService.validateQuantitySanity,
      ).toHaveBeenNthCalledWith(2, 102, db);

      expect(
        clienttraysValidationService.validateTrayCompleteness,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        clienttraysValidationService.validateTrayCompleteness,
      ).toHaveBeenNthCalledWith(2, 102, db);

      expect(
        collectionsValidationService.validateMorningCollections,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        collectionsValidationService.validateMorningCollections,
      ).toHaveBeenNthCalledWith(2, 102, db);

      expect(
        vehicleAllocationValidationService.validateVehicleAllocationsForMorningSubmit,
      ).toHaveBeenCalledWith(1, db);

      expect(
        vehicleAllocationValidationService.validateVehicleAssignmentsForMorningSubmit,
      ).toHaveBeenCalledWith(1, db);

      expect(
        purchaseValidationService.validatePurchasesComplete,
      ).toHaveBeenCalledWith(1, db);

      expect(
        dairyTraysValidationService.validateDairyTraysComplete,
      ).toHaveBeenCalledWith(1, db);

      expect(
        cashSettlementValidationService.validateMorningSubmitReadiness,
      ).toHaveBeenCalledWith(1, db);
    });

    it('validates each sheet in the required order', async () => {
      const calls: string[] = [];

      ordersValidationService.validateMorningEntriesComplete.mockImplementation(
        async () => {
          calls.push('morning-orders');
        },
      );

      ordersValidationService.validateQuantitySanity.mockImplementation(
        async () => {
          calls.push('quantity-sanity');
        },
      );

      clienttraysValidationService.validateTrayCompleteness.mockImplementation(
        async () => {
          calls.push('trays');
        },
      );

      collectionsValidationService.validateMorningCollections.mockImplementation(
        async () => {
          calls.push('collections');
        },
      );

      vehicleAllocationValidationService.validateVehicleAllocationsForMorningSubmit.mockImplementation(
        async () => {
          calls.push('vehicle-allocations');
        },
      );

      vehicleAllocationValidationService.validateVehicleAssignmentsForMorningSubmit.mockImplementation(
        async () => {
          calls.push('vehicle-assignments');
        },
      );

      purchaseValidationService.validatePurchasesComplete.mockImplementation(
        async () => {
          calls.push('purchases');
        },
      );

      dairyTraysValidationService.validateDairyTraysComplete.mockImplementation(
        async () => {
          calls.push('dairy-trays');
        },
      );

      cashSettlementValidationService.validateMorningSubmitReadiness.mockImplementation(
        async () => {
          calls.push('cash-settlement');
        },
      );

      await service.validateMorningSubmitReadiness(1, db);

      expect(calls).toEqual([
        'morning-orders',
        'quantity-sanity',
        'trays',
        'collections',
        'morning-orders',
        'quantity-sanity',
        'trays',
        'collections',
        'vehicle-allocations',
        'vehicle-assignments',
        'purchases',
        'dairy-trays',
        'cash-settlement',
      ]);
    });

    it('stops validation when a sheet-level validator fails', async () => {
      const error = new Error('quantity sanity failed');

      ordersValidationService.validateQuantitySanity.mockRejectedValueOnce(
        error,
      );

      await expect(service.validateMorningSubmitReadiness(1, db)).rejects.toBe(
        error,
      );

      expect(
        clienttraysValidationService.validateTrayCompleteness,
      ).not.toHaveBeenCalled();

      expect(
        collectionsValidationService.validateMorningCollections,
      ).not.toHaveBeenCalled();

      expect(
        vehicleAllocationValidationService.validateVehicleAllocationsForMorningSubmit,
      ).not.toHaveBeenCalled();

      expect(
        purchaseValidationService.validatePurchasesComplete,
      ).not.toHaveBeenCalled();

      expect(
        dairyTraysValidationService.validateDairyTraysComplete,
      ).not.toHaveBeenCalled();

      expect(
        cashSettlementValidationService.validateMorningSubmitReadiness,
      ).not.toHaveBeenCalled();
    });

    it('returns the paper when all validations pass', async () => {
      await expect(service.validateMorningSubmitReadiness(1, db)).resolves.toBe(
        nightSubmittedPaper,
      );
    });
  });

  describe('validateFinalizeReadiness', () => {
    it.each([OrderPaperStatus.MORNING_SUBMITTED, OrderPaperStatus.REOPENED])(
      'accepts %s status',
      async (status) => {
        const finalizePaper =
          status === OrderPaperStatus.MORNING_SUBMITTED
            ? morningSubmittedPaper
            : reopenedPaper;

        paperRepository.findPaperById.mockResolvedValue(finalizePaper);

        const result = await service.validateFinalizeReadiness(1, db);

        expect(result).toBe(finalizePaper);

        expect(
          collectionsValidationService.validateAdminCollections,
        ).toHaveBeenCalledTimes(sheets.length);

        expect(
          cashSettlementValidationService.validateReconciliationOnFinalize,
        ).toHaveBeenCalledWith(1, db);
      },
    );

    it('throws when paper does not exist', async () => {
      paperRepository.findPaperById.mockResolvedValue(null);

      await expect(service.validateFinalizeReadiness(1, db)).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND),
      );

      expect(paperRepository.getPaperSheets).not.toHaveBeenCalled();
    });

    it.each([
      OrderPaperStatus.DRAFT,
      OrderPaperStatus.NIGHT_SUBMITTED,
      OrderPaperStatus.FINALIZED,
    ])('rejects %s status', async (status) => {
      paperRepository.findPaperById.mockResolvedValue({
        id: 1,
        status,
      });

      await expect(service.validateFinalizeReadiness(1, db)).rejects.toThrow(
        ERROR_MESSAGES.INVALID_STATUS_TRANSITION(
          status,
          OrderPaperStatus.FINALIZED,
        ),
      );

      expect(paperRepository.getPaperSheets).not.toHaveBeenCalled();
    });

    it('validates admin collections for every sheet', async () => {
      paperRepository.findPaperById.mockResolvedValue(morningSubmittedPaper);

      await service.validateFinalizeReadiness(1, db);

      expect(
        collectionsValidationService.validateAdminCollections,
      ).toHaveBeenNthCalledWith(1, 101, db);

      expect(
        collectionsValidationService.validateAdminCollections,
      ).toHaveBeenNthCalledWith(2, 102, db);
    });

    it('runs reconciliation only after all admin collection validations pass', async () => {
      paperRepository.findPaperById.mockResolvedValue(morningSubmittedPaper);

      const calls: string[] = [];

      collectionsValidationService.validateAdminCollections.mockImplementation(
        async () => {
          calls.push('admin-collections');
        },
      );

      cashSettlementValidationService.validateReconciliationOnFinalize.mockImplementation(
        async () => {
          calls.push('reconciliation');
        },
      );

      await service.validateFinalizeReadiness(1, db);

      expect(calls).toEqual([
        'admin-collections',
        'admin-collections',
        'reconciliation',
      ]);
    });

    it('does not run reconciliation when admin collection validation fails', async () => {
      paperRepository.findPaperById.mockResolvedValue(morningSubmittedPaper);

      const error = new Error('admin collection validation failed');

      collectionsValidationService.validateAdminCollections.mockRejectedValueOnce(
        error,
      );

      await expect(service.validateFinalizeReadiness(1, db)).rejects.toBe(
        error,
      );

      expect(
        cashSettlementValidationService.validateReconciliationOnFinalize,
      ).not.toHaveBeenCalled();
    });

    it('passes the transaction object to every finalize validator', async () => {
      paperRepository.findPaperById.mockResolvedValue(morningSubmittedPaper);

      await service.validateFinalizeReadiness(1, db);

      for (const sheet of sheets) {
        expect(
          collectionsValidationService.validateAdminCollections,
        ).toHaveBeenCalledWith(sheet.id, db);
      }

      expect(
        cashSettlementValidationService.validateReconciliationOnFinalize,
      ).toHaveBeenCalledWith(1, db);
    });

    it('returns the paper when all validations pass', async () => {
      paperRepository.findPaperById.mockResolvedValue(morningSubmittedPaper);

      await expect(service.validateFinalizeReadiness(1, db)).resolves.toBe(
        morningSubmittedPaper,
      );
    });
  });
});
