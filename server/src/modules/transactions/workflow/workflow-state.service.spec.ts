import { describe, expect, it } from 'vitest';

import {
  DeliverySession,
  OrderPaperStatus,
} from '../../../generated/prisma/client.js';

import { WorkflowStateService } from './workflow-state.service.js';

describe('WorkflowStateService', () => {
  const workflowState = new WorkflowStateService();

  describe('validateTransition', () => {
    const validTransitions: Array<[OrderPaperStatus, OrderPaperStatus]> = [
      [OrderPaperStatus.DRAFT, OrderPaperStatus.NIGHT_SUBMITTED],
      [OrderPaperStatus.NIGHT_SUBMITTED, OrderPaperStatus.MORNING_SUBMITTED],
      [OrderPaperStatus.MORNING_SUBMITTED, OrderPaperStatus.FINALIZED],
      [OrderPaperStatus.FINALIZED, OrderPaperStatus.REOPENED],
      [OrderPaperStatus.REOPENED, OrderPaperStatus.FINALIZED],
    ];

    it.each(validTransitions)(
      'allows %s → %s',
      (currentStatus, targetStatus) => {
        expect(() =>
          workflowState.validateTransition(currentStatus, targetStatus),
        ).not.toThrow();
      },
    );

    const statuses = Object.values(OrderPaperStatus);

    const invalidTransitions = statuses.flatMap((currentStatus) =>
      statuses
        .filter(
          (targetStatus) =>
            !validTransitions.some(
              ([validCurrent, validTarget]) =>
                validCurrent === currentStatus && validTarget === targetStatus,
            ),
        )
        .map(
          (targetStatus) =>
            [currentStatus, targetStatus] as [
              OrderPaperStatus,
              OrderPaperStatus,
            ],
        ),
    );

    it.each(invalidTransitions)(
      'rejects %s → %s',
      (currentStatus, targetStatus) => {
        expect(() =>
          workflowState.validateTransition(currentStatus, targetStatus),
        ).toThrowError(
          `Cannot transition from ${currentStatus} to ${targetStatus}`,
        );
      },
    );
  });

  describe('resolveUseOrderedQuantity', () => {
    const cases: Array<[OrderPaperStatus, boolean, boolean]> = [
      [OrderPaperStatus.DRAFT, false, true],
      [OrderPaperStatus.DRAFT, true, true],

      [OrderPaperStatus.NIGHT_SUBMITTED, false, true],
      [OrderPaperStatus.NIGHT_SUBMITTED, true, false],

      [OrderPaperStatus.MORNING_SUBMITTED, false, false],
      [OrderPaperStatus.MORNING_SUBMITTED, true, false],

      [OrderPaperStatus.FINALIZED, false, false],
      [OrderPaperStatus.FINALIZED, true, false],

      [OrderPaperStatus.REOPENED, false, false],
      [OrderPaperStatus.REOPENED, true, false],
    ];

    it.each(cases)(
      'returns %s when status is %s and morningEntrySaved is %s',
      (status, morningEntrySaved, expected) => {
        expect(
          workflowState.resolveUseOrderedQuantity(status, morningEntrySaved),
        ).toBe(expected);
      },
    );
  });

  describe('getActiveExecutionSession', () => {
    it('returns NIGHT for DRAFT status', () => {
      expect(
        workflowState.getActiveExecutionSession(OrderPaperStatus.DRAFT),
      ).toBe(DeliverySession.NIGHT);
    });

    it('returns MORNING for NIGHT_SUBMITTED status', () => {
      expect(
        workflowState.getActiveExecutionSession(
          OrderPaperStatus.NIGHT_SUBMITTED,
        ),
      ).toBe(DeliverySession.MORNING);
    });

    const statusesWithoutActiveSession = [
      OrderPaperStatus.MORNING_SUBMITTED,
      OrderPaperStatus.FINALIZED,
      OrderPaperStatus.REOPENED,
    ];

    it.each(statusesWithoutActiveSession)(
      'rejects %s because it has no active execution session',
      (status) => {
        expect(() =>
          workflowState.getActiveExecutionSession(status),
        ).toThrowError(`No active execution session for status ${status}`);
      },
    );
  });

  describe('canEditNightEntries', () => {
    it.each([
      [OrderPaperStatus.DRAFT, true],
      [OrderPaperStatus.NIGHT_SUBMITTED, false],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, false],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditNightEntries(status)).toBe(expected);
    });
  });

  describe('canEditMorningEntries', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditMorningEntries(status)).toBe(expected);
    });
  });

  describe('canEditNightCollections', () => {
    it.each([
      [OrderPaperStatus.DRAFT, true],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditNightCollections(status)).toBe(expected);
    });
  });

  describe('canEditMorningCollections', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditMorningCollections(status)).toBe(expected);
    });
  });

  describe('canEditClientTrays', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditClientTrays(status)).toBe(expected);
    });
  });

  describe('canEditEmployeeCollections', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditEmployeeCollections(status)).toBe(expected);
    });
  });

  describe('canAdminEditCollections', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, false],
      [OrderPaperStatus.MORNING_SUBMITTED, true],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canAdminEditCollections(status)).toBe(expected);
    });
  });

  describe('canEditVehicleAllocations', () => {
    it.each([
      [OrderPaperStatus.DRAFT, DeliverySession.NIGHT, true],
      [OrderPaperStatus.DRAFT, DeliverySession.MORNING, false],

      [OrderPaperStatus.NIGHT_SUBMITTED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, DeliverySession.MORNING, true],

      [OrderPaperStatus.MORNING_SUBMITTED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.MORNING_SUBMITTED, DeliverySession.MORNING, false],

      [OrderPaperStatus.FINALIZED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.FINALIZED, DeliverySession.MORNING, false],

      [OrderPaperStatus.REOPENED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.REOPENED, DeliverySession.MORNING, false],
    ])(
      'returns %s for status=%s and session=%s',
      (status, session, expected) => {
        expect(workflowState.canEditVehicleAllocations(status, session)).toBe(
          expected,
        );
      },
    );
  });

  describe('canEditPurchases', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditPurchases(status)).toBe(expected);
    });
  });

  describe('canEditRouteExpenses', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditRouteExpenses(status)).toBe(expected);
    });
  });

  describe('canEditRouteDenominations', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, false],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditRouteDenominations(status)).toBe(expected);
    });
  });

  describe('canEditDirectCollections', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, false],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditDirectCollections(status)).toBe(expected);
    });
  });

  describe('canEditBankDeposits', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, false],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditBankDeposits(status)).toBe(expected);
    });
  });

  describe('canEditDairyTrays', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditDairyTrays(status)).toBe(expected);
    });
  });

  describe('canEditDistributorTransfers', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, false],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canEditDistributorTransfers(status)).toBe(expected);
    });
  });

  describe('canFinalize', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, false],
      [OrderPaperStatus.MORNING_SUBMITTED, true],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.canFinalize(status)).toBe(expected);
    });
  });

  describe('shouldValidatePurchases', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.shouldValidatePurchases(status)).toBe(expected);
    });
  });

  describe('shouldValidateDeliveredQuantity', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.shouldValidateDeliveredQuantity(status)).toBe(
        expected,
      );
    });
  });

  describe('shouldValidateClientTrays', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.shouldValidateClientTrays(status)).toBe(expected);
    });
  });

  describe('shouldValidateEmployeeCollections', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.shouldValidateEmployeeCollections(status)).toBe(
        expected,
      );
    });
  });

  describe('shouldValidateDairyTrayTracking', () => {
    it.each([
      [OrderPaperStatus.DRAFT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, true],
      [OrderPaperStatus.MORNING_SUBMITTED, false],
      [OrderPaperStatus.FINALIZED, false],
      [OrderPaperStatus.REOPENED, true],
    ])('returns %s for status=%s', (status, expected) => {
      expect(workflowState.shouldValidateDairyTrayTracking(status)).toBe(
        expected,
      );
    });
  });

  describe('shouldValidateVehicleAllocations', () => {
    it.each([
      [OrderPaperStatus.DRAFT, DeliverySession.NIGHT, true],
      [OrderPaperStatus.DRAFT, DeliverySession.MORNING, false],

      [OrderPaperStatus.NIGHT_SUBMITTED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.NIGHT_SUBMITTED, DeliverySession.MORNING, true],

      [OrderPaperStatus.MORNING_SUBMITTED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.MORNING_SUBMITTED, DeliverySession.MORNING, false],

      [OrderPaperStatus.FINALIZED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.FINALIZED, DeliverySession.MORNING, false],

      [OrderPaperStatus.REOPENED, DeliverySession.NIGHT, false],
      [OrderPaperStatus.REOPENED, DeliverySession.MORNING, false],
    ])(
      'returns %s for status=%s and session=%s',
      (status, session, expected) => {
        expect(
          workflowState.shouldValidateVehicleAllocations(status, session),
        ).toBe(expected);
      },
    );
  });
});
