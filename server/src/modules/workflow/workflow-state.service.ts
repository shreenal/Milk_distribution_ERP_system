import { Injectable, BadRequestException } from '@nestjs/common';

export type PaperStatus =
  | 'DRAFT'
  | 'NIGHT_SUBMITTED'
  | 'MORNING_SUBMITTED'
  | 'FINALIZED'
  | 'REOPENED';

@Injectable()
export class WorkflowStateService {
  validateTransition(
    currentStatus: PaperStatus,
    targetStatus: PaperStatus,
  ): void {
    const transitions: Record<PaperStatus, PaperStatus[]> = {
      DRAFT: ['NIGHT_SUBMITTED'],

      NIGHT_SUBMITTED: ['MORNING_SUBMITTED'],

      MORNING_SUBMITTED: ['FINALIZED'],

      FINALIZED: ['REOPENED'],

      REOPENED: ['FINALIZED'],
    };

    const allowed = transitions[currentStatus];

    if (!allowed?.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
      );
    }
  }

  canEditNightEntries(status: PaperStatus): boolean {
    return ['DRAFT'].includes(status);
  }

  canEditMorningEntries(status: PaperStatus): boolean {
    return ['NIGHT_SUBMITTED', 'REOPENED'].includes(status);
  }

  canEditNightCollections(status: PaperStatus): boolean {
    return ['DRAFT'].includes(status);
  }

  canEditMorningCollections(status: PaperStatus): boolean {
    return ['NIGHT_SUBMITTED'].includes(status);
  }

  canEditTrays(status: PaperStatus): boolean {
    return ['NIGHT_SUBMITTED', 'REOPENED'].includes(status);
  }

  canEmployeeEditCollections(status: PaperStatus): boolean {
    return ['DRAFT', 'NIGHT_SUBMITTED'].includes(status);
  }

  canAdminEditCollections(status: PaperStatus): boolean {
    return ['MORNING_SUBMITTED', 'REOPENED'].includes(status);
  }

  canEditVehicleAllocations(status: PaperStatus): boolean {
    return ['DRAFT'].includes(status);
  }

  canEditPurchases(status: PaperStatus): boolean {
    return ['NIGHT_SUBMITTED', 'REOPENED'].includes(status);
  }

  canFinalize(status: PaperStatus): boolean {
    return ['MORNING_SUBMITTED', 'REOPENED'].includes(status);
  }
}
