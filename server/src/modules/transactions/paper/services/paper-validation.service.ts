import { BadRequestException, Injectable } from '@nestjs/common';
import { ERROR_MESSAGES } from '../paper.constants.js';
import { VehicleAllocationValidationService } from '../../vehicle-allocation/services/vehicle-allocation-validation.service.js';
import { ClientTraysValidationService } from '../../client-trays/services/client-trays-validation.service.js';
import { CollectionsValidationService } from '../../collections/services/collections-validation.service.js';
import { OrdersValidationService } from '../../orders/services/orders-validation.service.js';
import { PaperRepository } from '../paper.repository.js';
import { PurchaseValidationService } from '../../purchase/services/purchase-validation.service.js';
import { CashSettlementValidationService } from '../../cash-settlement/services/cash-settlement-validation.service.js';
import { DairyTraysValidationService } from '../../dairy-trays/services/dairy-trays-validation.service.js';
import { WorkflowStateService } from '../../workflow/workflow-state.service.js';

@Injectable()
export class PaperValidationService {
  constructor(
    private readonly paperRepository: PaperRepository,
    private readonly workflowState: WorkflowStateService,
    private readonly ordersValidationService: OrdersValidationService,
    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,
    private readonly clienttraysValidationService: ClientTraysValidationService,
    private readonly collectionsValidationService: CollectionsValidationService,
    private readonly purchaseValidationService: PurchaseValidationService,
    private readonly cashSettlementValidationService: CashSettlementValidationService,
    private readonly dairyTraysValidationService: DairyTraysValidationService,
  ) {}

  async validateNightSubmitReadiness(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (paper.status !== 'DRAFT') {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_IN_DRAFT_STATUS);
    }
    const sheets = await this.paperRepository.getPaperSheets(paperId);

    await this.vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit(
      paperId,
    );

    await this.vehicleAllocationValidationService.validateVehicleAssignmentsForNightSubmit(
      paperId,
    );

    for (const sheet of sheets) {
      await this.ordersValidationService.validateNightEntriesComplete(
        sheet.id,
        sheet.master_group.name,
      );

      await this.clienttraysValidationService.validateTrayCalculationExists(
        sheet.id,
      );

      await this.collectionsValidationService.validateNightCollections(
        sheet.id,
      );
    }

    return paper;
  }

  async validateMorningSubmitReadiness(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    const sheets = await this.paperRepository.getPaperSheets(paperId);

    for (const sheet of sheets) {
      await this.ordersValidationService.validateMorningEntriesComplete(
        sheet.id,
      );

      await this.ordersValidationService.validateQuantitySanity(sheet.id);

      await this.clienttraysValidationService.validateTrayCompleteness(
        sheet.id,
      );

      await this.collectionsValidationService.validateMorningCollections(
        sheet.id,
      );
    }
    await this.purchaseValidationService.validatePurchasesComplete(paperId);
    await this.dairyTraysValidationService.validateDairyTraysComplete(paperId);
    await this.cashSettlementValidationService.validateMorningSubmitReadiness(
      paperId,
    );

    return paper;
  }

  async validateFinalizeReadiness(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    const sheets = await this.paperRepository.getPaperSheets(paperId);

    for (const sheet of sheets) {
      await this.collectionsValidationService.validateAdminCollections(
        sheet.id,
      );
    }

    return paper;
  }
}
