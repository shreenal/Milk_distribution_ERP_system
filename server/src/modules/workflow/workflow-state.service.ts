import { Injectable, BadRequestException } from '@nestjs/common';

import {
  DeliverySession,
  OrderPaperStatus,
} from '../../generated/prisma/client.js';

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

  // canEditMorningEntries(status: OrderPaperStatus): boolean {
  //   return (
  //     status === OrderPaperStatus.NIGHT_SUBMITTED
  //   );
  // }

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

  // canEditTrays(status: OrderPaperStatus): boolean {
  //   return (
  //     status === OrderPaperStatus.NIGHT_SUBMITTED ||
  //     status === OrderPaperStatus.REOPENED
  //   );
  // }

  canEditTrays(status: OrderPaperStatus): boolean {
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

  // canEditVehicleAllocations(status: OrderPaperStatus): boolean {
  //   return status === OrderPaperStatus.DRAFT;
  // }

  canEditVehicleAllocations(
    status: OrderPaperStatus,
    session: DeliverySession,
  ): boolean {
    return this.canEditExecutionModule(status, session);
  }

  // canEditPurchases(status: OrderPaperStatus): boolean {
  //   return (
  //     status === OrderPaperStatus.NIGHT_SUBMITTED ||
  //     status === OrderPaperStatus.REOPENED
  //   );
  // }

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

  // canEditDairyTrayTracking(status: OrderPaperStatus): boolean {
  //   return (
  //     status === OrderPaperStatus.NIGHT_SUBMITTED ||
  //     status === OrderPaperStatus.REOPENED
  //   );
  // }

  canEditDairyTrayTracking(status: OrderPaperStatus): boolean {
    return this.canEditCompletionModule(status);
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

  shouldValidateTrays(status: OrderPaperStatus): boolean {
    return this.canEditTrays(status);
  }

  shouldValidateEmployeeCollections(status: OrderPaperStatus): boolean {
    return this.canEditEmployeeCollections(status);
  }

  shouldValidateDairyTrayTracking(status: OrderPaperStatus): boolean {
    return this.canEditDairyTrayTracking(status);
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
      return true;
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
