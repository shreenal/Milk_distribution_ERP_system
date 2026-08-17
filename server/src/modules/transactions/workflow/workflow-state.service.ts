import { Injectable, BadRequestException } from '@nestjs/common';

import {
  DeliverySession,
  OrderPaperStatus,
} from '../../../generated/prisma/client.js';

@Injectable()
export class WorkflowStateService {
  validateTransition(
    currentStatus: OrderPaperStatus,
    targetStatus: OrderPaperStatus,
  ): void {
    const transitions: Record<OrderPaperStatus, OrderPaperStatus[]> = {
      [OrderPaperStatus.DRAFT]: [OrderPaperStatus.NIGHT_SUBMITTED],

      [OrderPaperStatus.NIGHT_SUBMITTED]: [OrderPaperStatus.MORNING_SUBMITTED],

      [OrderPaperStatus.MORNING_SUBMITTED]: [OrderPaperStatus.FINALIZED],

      [OrderPaperStatus.FINALIZED]: [OrderPaperStatus.REOPENED],

      [OrderPaperStatus.REOPENED]: [OrderPaperStatus.FINALIZED],
    };

    const allowed = transitions[currentStatus];

    if (!allowed?.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
      );
    }
  }

  /**
   * Business lifecycle invariant:
   *
   * ordered_qty is editable only during DRAFT.
   *
   * It represents the client's requested quantity and is used for
   * Vehicle Allocation planning.
   *
   * delivered_qty is the actual quantity delivered to the client.
   * It is recorded during the completion phase and may be corrected
   * while a finalized paper is REOPENED.
   *
   * Reopening therefore permits correction of delivery results without
   * reopening or recalculating the historical Vehicle Allocation plan.
   */
  canEditNightEntries(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.DRAFT;
  }

  canEditMorningEntries(status: OrderPaperStatus): boolean {
    return this.canEditCompletionModule(status);
  }

  canEditNightCollections(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.DRAFT ||
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  canEditMorningCollections(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  canEditClientTrays(status: OrderPaperStatus): boolean {
    return this.canEditCompletionModule(status);
  }

  canEditEmployeeCollections(status: OrderPaperStatus): boolean {
    return this.canEditCompletionModule(status);
  }

  canAdminEditCollections(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.MORNING_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  canEditVehicleAllocations(
    status: OrderPaperStatus,
    session: DeliverySession,
  ): boolean {
    return this.canEditExecutionModule(status, session);
  }

  canEditPurchases(status: OrderPaperStatus): boolean {
    return this.canEditCompletionModule(status);
  }

  canEditRouteExpenses(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  canEditRouteDenominations(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.NIGHT_SUBMITTED;
  }

  canEditDirectCollections(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.NIGHT_SUBMITTED;
  }

  canEditBankDeposits(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.NIGHT_SUBMITTED;
  }

  canEditDairyTrays(status: OrderPaperStatus): boolean {
    return this.canEditCompletionModule(status);
  }

  canEditDistributorTransfers(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.REOPENED;
  }

  private isActiveExecutionSession(
    status: OrderPaperStatus,
    session: DeliverySession,
  ): boolean {
    switch (status) {
      case OrderPaperStatus.DRAFT:
        return session === DeliverySession.NIGHT;

      case OrderPaperStatus.NIGHT_SUBMITTED:
        return session === DeliverySession.MORNING;

      default:
        return false;
    }
  }

  shouldValidateVehicleAllocations(
    status: OrderPaperStatus,
    session: DeliverySession,
  ): boolean {
    return this.canEditExecutionModule(status, session);
  }

  shouldValidatePurchases(status: OrderPaperStatus): boolean {
    return this.canEditPurchases(status);
  }

  shouldValidateDeliveredQuantity(status: OrderPaperStatus): boolean {
    return this.canEditMorningEntries(status);
  }

  shouldValidateClientTrays(status: OrderPaperStatus): boolean {
    return this.canEditClientTrays(status);
  }

  shouldValidateEmployeeCollections(status: OrderPaperStatus): boolean {
    return this.canEditEmployeeCollections(status);
  }

  shouldValidateDairyTrayTracking(status: OrderPaperStatus): boolean {
    return this.canEditDairyTrays(status);
  }

  canFinalize(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.MORNING_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  private canEditExecutionModule(
    status: OrderPaperStatus,
    session: DeliverySession,
  ): boolean {
    if (status === OrderPaperStatus.REOPENED) {
      return false;
    }

    return this.isActiveExecutionSession(status, session);
  }

  private canEditCompletionModule(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  getActiveExecutionSession(status: OrderPaperStatus): DeliverySession {
    switch (status) {
      case OrderPaperStatus.DRAFT:
        return DeliverySession.NIGHT;

      case OrderPaperStatus.NIGHT_SUBMITTED:
        return DeliverySession.MORNING;

      default:
        throw new BadRequestException(
          `No active execution session for status ${status}`,
        );
    }
  }
}
