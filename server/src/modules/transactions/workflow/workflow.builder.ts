import { Injectable } from '@nestjs/common';
import {
  DeliverySession,
  OrderPaperStatus,
} from '../../../generated/prisma/client.js';
import { WorkflowStateService } from './workflow-state.service.js';

@Injectable()
export class WorkflowBuilder {
  constructor(private readonly workflowState: WorkflowStateService) {}

  buildOrdersWorkflow(status: OrderPaperStatus) {
    return {
      status,
      editable:
        this.workflowState.canEditNightEntries(status) ||
        this.workflowState.canEditMorningEntries(status),
    };
  }

  buildCollectionsWorkflow(status: OrderPaperStatus) {
    return {
      status,
      permissions: {
        canEditNightCollections:
          this.workflowState.canEditNightCollections(status),

        canEditMorningCollections:
          this.workflowState.canEditMorningCollections(status),

        canEditAdminCollections:
          this.workflowState.canAdminEditCollections(status),

        canFinalize: this.workflowState.canFinalize(status),
      },
    };
  }

  buildTraysWorkflow(status: OrderPaperStatus) {
    return {
      status,
      editable: this.workflowState.canEditTrays(status),
    };
  }

  buildPurchasesWorkflow(status: OrderPaperStatus) {
    return {
      status,
      editable: this.workflowState.canEditPurchases(status),
    };
  }

  buildDairyTrayTrackingWorkflow(status: OrderPaperStatus) {
    return {
      status,
      editable: this.workflowState.canEditDairyTrayTracking(status),
    };
  }

  buildVehicleAllocationWorkflow(
    status: OrderPaperStatus,
    session: DeliverySession,
  ) {
    return {
      status,
      editable: this.workflowState.canEditVehicleAllocations(status, session),
    };
  }

  buildDistributorTransferWorkflow(status: OrderPaperStatus) {
    return {
      status,
    };
  }

  buildCashSettlementWorkflow(status: OrderPaperStatus) {
    return {
      status,
      permissions: {
        canEditRouteExpenses: this.workflowState.canEditRouteExpenses(status),

        canEditRouteDenominations:
          this.workflowState.canEditRouteDenominations(status),

        canEditDirectCollections:
          this.workflowState.canEditDirectCollections(status),

        canEditBankDeposits: this.workflowState.canEditBankDeposits(status),
      },
    };
  }
}
