import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DeliverySession,
  OrderPaperStatus,
} from '../../../generated/prisma/client.js';

import { WorkflowBuilder } from './workflow.builder.js';
import { WorkflowStateService } from './workflow-state.service.js';

describe('WorkflowBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const workflowState = {
    canEditNightEntries: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditMorningEntries: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditNightCollections: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditMorningCollections: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canAdminEditCollections: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canFinalize: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditClientTrays: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditPurchases: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditDairyTrays: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditVehicleAllocations:
      vi.fn<(status: OrderPaperStatus, session: DeliverySession) => boolean>(),
    canEditRouteExpenses: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditRouteDenominations: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditDirectCollections: vi.fn<(status: OrderPaperStatus) => boolean>(),
    canEditBankDeposits: vi.fn<(status: OrderPaperStatus) => boolean>(),
  };

  const builder = new WorkflowBuilder(
    workflowState as unknown as WorkflowStateService,
  );

  describe('buildOrdersWorkflow', () => {
    it('returns status and editable permission', () => {
      workflowState.canEditNightEntries.mockReturnValue(false);
      workflowState.canEditMorningEntries.mockReturnValue(true);

      expect(
        builder.buildOrdersWorkflow(OrderPaperStatus.NIGHT_SUBMITTED),
      ).toEqual({
        status: OrderPaperStatus.NIGHT_SUBMITTED,
        editable: true,
      });
    });

    it('sets editable to false when neither night nor morning entries are editable', () => {
      workflowState.canEditNightEntries.mockReturnValue(false);
      workflowState.canEditMorningEntries.mockReturnValue(false);

      expect(builder.buildOrdersWorkflow(OrderPaperStatus.FINALIZED)).toEqual({
        status: OrderPaperStatus.FINALIZED,
        editable: false,
      });
    });

    it('sets editable to true when night entries are editable', () => {
      workflowState.canEditNightEntries.mockReturnValue(true);
      workflowState.canEditMorningEntries.mockReturnValue(false);

      expect(builder.buildOrdersWorkflow(OrderPaperStatus.DRAFT)).toEqual({
        status: OrderPaperStatus.DRAFT,
        editable: true,
      });
    });

    it('checks morning edit permission when night edit permission is false', () => {
      workflowState.canEditNightEntries.mockReturnValue(false);
      workflowState.canEditMorningEntries.mockReturnValue(true);

      builder.buildOrdersWorkflow(OrderPaperStatus.NIGHT_SUBMITTED);

      expect(workflowState.canEditNightEntries).toHaveBeenCalledWith(
        OrderPaperStatus.NIGHT_SUBMITTED,
      );

      expect(workflowState.canEditMorningEntries).toHaveBeenCalledWith(
        OrderPaperStatus.NIGHT_SUBMITTED,
      );
    });

    it('does not check morning edit permission when night edit permission is true', () => {
      workflowState.canEditNightEntries.mockReturnValue(true);

      builder.buildOrdersWorkflow(OrderPaperStatus.DRAFT);

      expect(workflowState.canEditNightEntries).toHaveBeenCalledWith(
        OrderPaperStatus.DRAFT,
      );

      expect(workflowState.canEditMorningEntries).not.toHaveBeenCalled();
    });
  });

  describe('buildCollectionsWorkflow', () => {
    it('returns the complete collections permission object', () => {
      workflowState.canEditNightCollections.mockReturnValue(true);
      workflowState.canEditMorningCollections.mockReturnValue(false);
      workflowState.canAdminEditCollections.mockReturnValue(true);
      workflowState.canFinalize.mockReturnValue(true);

      expect(
        builder.buildCollectionsWorkflow(OrderPaperStatus.REOPENED),
      ).toEqual({
        status: OrderPaperStatus.REOPENED,
        permissions: {
          canEditNightCollections: true,
          canEditMorningCollections: false,
          canEditAdminCollections: true,
          canFinalize: true,
        },
      });
    });

    it('passes status to every collections permission check', () => {
      const status = OrderPaperStatus.MORNING_SUBMITTED;

      builder.buildCollectionsWorkflow(status);

      expect(workflowState.canEditNightCollections).toHaveBeenCalledWith(
        status,
      );
      expect(workflowState.canEditMorningCollections).toHaveBeenCalledWith(
        status,
      );
      expect(workflowState.canAdminEditCollections).toHaveBeenCalledWith(
        status,
      );
      expect(workflowState.canFinalize).toHaveBeenCalledWith(status);
    });
  });

  describe('buildTraysWorkflow', () => {
    it('returns status and editable permission', () => {
      workflowState.canEditClientTrays.mockReturnValue(true);

      expect(
        builder.buildTraysWorkflow(OrderPaperStatus.NIGHT_SUBMITTED),
      ).toEqual({
        status: OrderPaperStatus.NIGHT_SUBMITTED,
        editable: true,
      });
    });

    it('delegates editability to client tray permission', () => {
      const status = OrderPaperStatus.REOPENED;

      workflowState.canEditClientTrays.mockReturnValue(false);

      builder.buildTraysWorkflow(status);

      expect(workflowState.canEditClientTrays).toHaveBeenCalledWith(status);
    });
  });

  describe('buildPurchasesWorkflow', () => {
    it('returns status and editable permission', () => {
      workflowState.canEditPurchases.mockReturnValue(true);

      expect(
        builder.buildPurchasesWorkflow(OrderPaperStatus.NIGHT_SUBMITTED),
      ).toEqual({
        status: OrderPaperStatus.NIGHT_SUBMITTED,
        editable: true,
      });
    });

    it('delegates editability to purchase permission', () => {
      const status = OrderPaperStatus.REOPENED;

      workflowState.canEditPurchases.mockReturnValue(false);

      builder.buildPurchasesWorkflow(status);

      expect(workflowState.canEditPurchases).toHaveBeenCalledWith(status);
    });
  });

  describe('buildDairyTrayTrackingWorkflow', () => {
    it('returns status and editable permission', () => {
      workflowState.canEditDairyTrays.mockReturnValue(true);

      expect(
        builder.buildDairyTrayTrackingWorkflow(
          OrderPaperStatus.NIGHT_SUBMITTED,
        ),
      ).toEqual({
        status: OrderPaperStatus.NIGHT_SUBMITTED,
        editable: true,
      });
    });

    it('delegates editability to dairy tray permission', () => {
      const status = OrderPaperStatus.FINALIZED;

      workflowState.canEditDairyTrays.mockReturnValue(false);

      builder.buildDairyTrayTrackingWorkflow(status);

      expect(workflowState.canEditDairyTrays).toHaveBeenCalledWith(status);
    });
  });

  describe('buildVehicleAllocationWorkflow', () => {
    it('returns status and editable permission', () => {
      workflowState.canEditVehicleAllocations.mockReturnValue(true);

      expect(
        builder.buildVehicleAllocationWorkflow(
          OrderPaperStatus.DRAFT,
          DeliverySession.NIGHT,
        ),
      ).toEqual({
        status: OrderPaperStatus.DRAFT,
        editable: true,
      });
    });

    it('passes both status and session to vehicle allocation permission', () => {
      const status = OrderPaperStatus.NIGHT_SUBMITTED;
      const session = DeliverySession.MORNING;

      workflowState.canEditVehicleAllocations.mockReturnValue(false);

      builder.buildVehicleAllocationWorkflow(status, session);

      expect(workflowState.canEditVehicleAllocations).toHaveBeenCalledWith(
        status,
        session,
      );
    });
  });

  describe('buildDistributorTransferWorkflow', () => {
    it('returns only the status', () => {
      expect(
        builder.buildDistributorTransferWorkflow(OrderPaperStatus.REOPENED),
      ).toEqual({
        status: OrderPaperStatus.REOPENED,
      });
    });

    it('does not expose an editable permission', () => {
      const result = builder.buildDistributorTransferWorkflow(
        OrderPaperStatus.REOPENED,
      );

      expect(result).not.toHaveProperty('editable');
      expect(result).not.toHaveProperty('permissions');
    });
  });

  describe('buildCashSettlementWorkflow', () => {
    it('returns the complete cash settlement permission object', () => {
      workflowState.canEditRouteExpenses.mockReturnValue(true);
      workflowState.canEditRouteDenominations.mockReturnValue(false);
      workflowState.canEditDirectCollections.mockReturnValue(true);
      workflowState.canEditBankDeposits.mockReturnValue(false);

      expect(
        builder.buildCashSettlementWorkflow(OrderPaperStatus.NIGHT_SUBMITTED),
      ).toEqual({
        status: OrderPaperStatus.NIGHT_SUBMITTED,
        permissions: {
          canEditRouteExpenses: true,
          canEditRouteDenominations: false,
          canEditDirectCollections: true,
          canEditBankDeposits: false,
        },
      });
    });

    it('passes status to every cash settlement permission check', () => {
      const status = OrderPaperStatus.REOPENED;

      builder.buildCashSettlementWorkflow(status);

      expect(workflowState.canEditRouteExpenses).toHaveBeenCalledWith(status);
      expect(workflowState.canEditRouteDenominations).toHaveBeenCalledWith(
        status,
      );
      expect(workflowState.canEditDirectCollections).toHaveBeenCalledWith(
        status,
      );
      expect(workflowState.canEditBankDeposits).toHaveBeenCalledWith(status);
    });
  });
});
