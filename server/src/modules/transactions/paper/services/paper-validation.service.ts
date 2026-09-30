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
import { OrderPaperStatus } from '../../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { DistributorTransferValidationService } from '../../distributor-transfer/services/distributor-transfer-validation.service.js';

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
    private readonly distributorTransferValidationService: DistributorTransferValidationService,
  ) {}

  async validateNightSubmitReadiness(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (paper.status !== OrderPaperStatus.DRAFT) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_IN_DRAFT_STATUS);
    }

    const sheets = await this.paperRepository.getPaperSheets(paperId, db);

    for (const sheet of sheets) {
      await this.ordersValidationService.validateNightEntriesComplete(
        sheet.id,
        sheet.master_group.name,
        db,
      );

      await this.clienttraysValidationService.validateTrayCalculationExists(
        sheet.id,
        db,
      );

      await this.collectionsValidationService.validateNightCollections(
        sheet.id,
        db,
      );
    }

    await this.vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit(
      paperId,
      db,
    );

    return paper;
  }

  async validateMorningSubmitReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (paper.status !== OrderPaperStatus.NIGHT_SUBMITTED) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_STATUS_TRANSITION(
          paper.status,
          OrderPaperStatus.MORNING_SUBMITTED,
        ),
      );
    }

    await this.runCompletionValidations(paperId, db);

    return paper;
  }

  async validateFinalizeReadiness(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (
      paper.status !== OrderPaperStatus.MORNING_SUBMITTED &&
      paper.status !== OrderPaperStatus.REOPENED
    ) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_STATUS_TRANSITION(
          paper.status,
          OrderPaperStatus.FINALIZED,
        ),
      );
    }

    // FIX C1 (production review): a REOPENED paper can have its purchases,
    // dairy trays, client trays, vehicle allocations and distributor
    // transfers edited before being finalized again. Previously only
    // admin-collections and cash-settlement reconciliation were re-checked
    // here, so an edit that broke purchase-vs-allocation completeness, tray
    // return completeness, or transfer-rule coverage could sail through a
    // second finalize even though the exact same check would have blocked
    // the original morning submission. Re-running the full completion
    // validation set here closes that gap. This intentionally duplicates
    // the checks already run at MORNING_SUBMITTED time — a paper can only
    // reach REOPENED after already passing them once, but "already passing
    // once" is not a guarantee about the paper's *current* state after
    // further edits.
    if (paper.status === OrderPaperStatus.REOPENED) {
      await this.runCompletionValidations(paperId, db);
    }

    const sheets = await this.paperRepository.getPaperSheets(paperId, db);

    for (const sheet of sheets) {
      await this.collectionsValidationService.validateAdminCollections(
        sheet.id,
        db,
      );
    }

    await this.cashSettlementValidationService.validateReconciliationOnFinalize(
      paperId,
      db,
    );

    return paper;
  }

  private async runCompletionValidations(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const sheets = await this.paperRepository.getPaperSheets(paperId, db);

    for (const sheet of sheets) {
      await this.ordersValidationService.validateMorningEntriesComplete(
        sheet.id,
        db,
      );

      await this.ordersValidationService.validateQuantitySanity(sheet.id, db);

      await this.clienttraysValidationService.validateTrayCompleteness(
        sheet.id,
        db,
      );

      await this.collectionsValidationService.validateMorningCollections(
        sheet.id,
        db,
      );
    }

    await this.vehicleAllocationValidationService.validateVehicleAllocationsForMorningSubmit(
      paperId,
      db,
    );

    await this.purchaseValidationService.validatePurchasesComplete(paperId, db);

    await this.dairyTraysValidationService.validateDairyTraysComplete(
      paperId,
      db,
    );

    await this.distributorTransferValidationService.validateGenerationReadiness(
      paperId,
      db,
    );

    await this.cashSettlementValidationService.validateMorningSubmitReadiness(
      paperId,
      db,
    );
  }
}
