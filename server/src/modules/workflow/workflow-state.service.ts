import { Injectable, BadRequestException } from '@nestjs/common';

import { OrderPaperStatus } from '../../generated/prisma/client.js';

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

  canEditNightEntries(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.DRAFT;
  }

  canEditMorningEntries(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
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

  canEditTrays(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  canEmployeeEditCollections(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.DRAFT ||
      status === OrderPaperStatus.NIGHT_SUBMITTED
    );
  }

  canAdminEditCollections(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.MORNING_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

  canEditVehicleAllocations(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.DRAFT;
  }

  canEditPurchases(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.NIGHT_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }

canEditRouteExpenses(
  status: OrderPaperStatus,
): boolean {
  return (
    status === OrderPaperStatus.NIGHT_SUBMITTED ||
    status === OrderPaperStatus.REOPENED
  );
}

canEditRouteDenominations(
  status: OrderPaperStatus,
): boolean {
  return status === OrderPaperStatus.NIGHT_SUBMITTED;
}

canEditDirectCollections(
  status: OrderPaperStatus,
): boolean {
  return status === OrderPaperStatus.NIGHT_SUBMITTED;
}

canEditBankDeposits(
  status: OrderPaperStatus,
): boolean {
  return status === OrderPaperStatus.NIGHT_SUBMITTED;
}

  canFinalize(status: OrderPaperStatus): boolean {
    return (
      status === OrderPaperStatus.MORNING_SUBMITTED ||
      status === OrderPaperStatus.REOPENED
    );
  }
}
