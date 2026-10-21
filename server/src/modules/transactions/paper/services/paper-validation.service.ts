import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ERROR_MESSAGES } from '../paper.constants.js';
import { VehicleAllocationValidationService } from '../../vehicle-allocation/services/vehicle-allocation-validation.service.js';
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
import { formatIsoDate } from '../paper-date.util.js';

type PaperSheet = Awaited<ReturnType<PaperRepository['getPaperSheets']>>[number];

@Injectable()
export class PaperValidationService {
  constructor(
    private readonly paperRepository: PaperRepository,
    private readonly workflowState: WorkflowStateService,
    private readonly ordersValidationService: OrdersValidationService,
    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,
    private readonly collectionsValidationService: CollectionsValidationService,
    private readonly purchaseValidationService: PurchaseValidationService,
    private readonly cashSettlementValidationService: CashSettlementValidationService,
    private readonly dairyTraysValidationService: DairyTraysValidationService,
    private readonly distributorTransferValidationService: DistributorTransferValidationService,
  ) {}

  // ---------------------------------------------------------------------
  // Aggregation helpers (PA-6.4 / PA-7.4 / PA-8.6)
  //
  // Every readiness check is read-only, so a failing check does not stop the
  // next one. HttpException failures are collected and reported together;
  // anything else (a database or programming error) is rethrown at once.
  // The final throw still rolls the whole transaction back.
  // ---------------------------------------------------------------------

  private async collect(
    failures: string[],
    check: () => Promise<unknown>,
    prefix = '',
  ): Promise<void> {
    try {
      await check();
    } catch (error) {
      if (!(error instanceof HttpException)) {
        throw error;
      }
      for (const detail of this.describeFailure(error)) {
        failures.push(prefix + detail);
      }
    }
  }

  private describeFailure(error: HttpException): string[] {
    const body = error.getResponse();
    if (
      typeof body === 'object' &&
      body !== null &&
      'details' in body &&
      Array.isArray(body.details) &&
      body.details.length > 0
    ) {
      return body.details.map(String);
    }
    return [error.message];
  }

  private throwIfAny(message: string, failures: string[]): void {
    const details = [...new Set(failures)];
    if (details.length > 0) {
      throw new BadRequestException({ message, details });
    }
  }

  // PA-6.5 / PA-7.5: a sheet of a deactivated group that has no order line at
  // all can never satisfy the orders checks and cannot be excluded any other
  // way. It is skipped for the orders checks only. A deactivated group that
  // does have order lines is validated like any other sheet.
  private isIgnorableSheet(sheet: PaperSheet): boolean {
    return (
      !sheet.master_group.is_active && sheet._count.order_sheet_items === 0
    );
  }

  // ---------------------------------------------------------------------
  // Night submit
  // ---------------------------------------------------------------------

  async validateNightSubmitReadiness(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (paper.status !== OrderPaperStatus.DRAFT) {
      throw new ConflictException(
        ERROR_MESSAGES.NIGHT_ALREADY_SUBMITTED(paper.status),
      );
    }

    const sheets = await this.paperRepository.getPaperSheets(paperId, db);
    const failures: string[] = [];

    for (const sheet of sheets) {
      const name = sheet.master_group.name;

      if (!this.isIgnorableSheet(sheet)) {
        await this.collect(failures, () =>
          this.ordersValidationService.validateNightEntriesComplete(
            sheet.id,
            name,
            db,
          ),
        );
      }

      // PA-6.3: there is no client-tray ledger check at night submit. The
      // ledger is recalculated on every Orders save, and a sheet that orders
      // only non-tray products legitimately has no ledger line.

      await this.collect(
        failures,
        () =>
          this.collectionsValidationService.validateNightCollections(
            sheet.id,
            db,
          ),
        `Sheet "${name}": `,
      );
    }

    await this.collect(failures, () =>
      this.vehicleAllocationValidationService.validateVehicleAllocationsForNightSubmit(
        paperId,
        db,
      ),
    );

    this.throwIfAny(ERROR_MESSAGES.NIGHT_NOT_READY, failures);

    return paper;
  }

  // ---------------------------------------------------------------------
  // Morning submit
  // ---------------------------------------------------------------------

  async validateMorningSubmitReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (
      paper.status === OrderPaperStatus.MORNING_SUBMITTED ||
      paper.status === OrderPaperStatus.FINALIZED ||
      paper.status === OrderPaperStatus.REOPENED
    ) {
      throw new ConflictException(
        ERROR_MESSAGES.MORNING_ALREADY_SUBMITTED(paper.status),
      );
    }

    if (paper.status !== OrderPaperStatus.NIGHT_SUBMITTED) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_STATUS_TRANSITION(
          paper.status,
          OrderPaperStatus.MORNING_SUBMITTED,
        ),
      );
    }

    const failures: string[] = [];
    await this.runCompletionValidations(paperId, db, failures, {
      includeVehicleAllocation: true,
    });
    this.throwIfAny(ERROR_MESSAGES.MORNING_NOT_READY, failures);

    return paper;
  }

  // ---------------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------------

  async validateFinalizeReadiness(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    if (paper.status === OrderPaperStatus.FINALIZED) {
      throw new ConflictException(ERROR_MESSAGES.ALREADY_FINALIZED);
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

    // Sequential processing: the previous business paper must be finalized
    // first, and its background tray propagation must not have failed.
    // Applies to re-finalizing a REOPENED paper too. Read inside the caller's
    // Serializable transaction, so a concurrent change to the previous paper
    // cannot slip past this check.
    await this.assertPreviousPaperFinalized(paper.sale_date, db);

    const failures: string[] = [];

    // FIX C1 (production review): a REOPENED paper can have its purchases,
    // dairy trays, client trays and delivered quantities edited before being
    // finalized again, so the completion validation set is re-run here.
    // PA-8.3: the VEHICLE ALLOCATION gate is deliberately left out. Allocations
    // are locked while a paper is REOPENED (VA-2.4, VA-7.7), so an allocation
    // problem that appeared after the original morning submit (for example a
    // vehicle or product link deactivated since) could not be fixed from the
    // allocation screen and would make re-finalizing impossible. Purchases
    // keeps its own stale / orphan gate against the allocation.
    if (paper.status === OrderPaperStatus.REOPENED) {
      await this.runCompletionValidations(paperId, db, failures, {
        includeVehicleAllocation: false,
      });
    }

    const sheets = await this.paperRepository.getPaperSheets(paperId, db);

    for (const sheet of sheets) {
      await this.collect(
        failures,
        () =>
          this.collectionsValidationService.validateAdminCollections(
            sheet.id,
            db,
          ),
        `Sheet "${sheet.master_group.name}": `,
      );
    }

    await this.collect(failures, () =>
      this.cashSettlementValidationService.validateReconciliationOnFinalize(
        paperId,
        db,
      ),
    );

    this.throwIfAny(ERROR_MESSAGES.FINALIZE_NOT_READY, failures);

    return paper;
  }

  private async assertPreviousPaperFinalized(
    saleDate: Date,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const previous = await this.paperRepository.findPreviousPaper(saleDate, db);

    if (!previous) {
      return;
    }

    if (previous.status !== OrderPaperStatus.FINALIZED) {
      throw new ConflictException(
        ERROR_MESSAGES.PREVIOUS_PAPER_NOT_FINALIZED(
          formatIsoDate(previous.sale_date),
          previous.status,
        ),
      );
    }

    // PA-8.4: only FAILED blocks. Work that is still PENDING / PROCESSING does
    // not, because every Orders, Purchase and tray save already recalculates
    // its own ledger synchronously; propagation is the safety net for later days.
    const failed = await this.paperRepository.countFailedPropagations(
      previous.id,
      db,
    );

    if (failed > 0) {
      throw new ConflictException(
        ERROR_MESSAGES.PREVIOUS_PAPER_PROPAGATION_FAILED(
          formatIsoDate(previous.sale_date),
        ),
      );
    }
  }

  private async runCompletionValidations(
    paperId: number,
    db: PrismaOrTransaction,
    failures: string[],
    options: { includeVehicleAllocation: boolean },
  ): Promise<void> {
    const sheets = await this.paperRepository.getPaperSheets(paperId, db);

    for (const sheet of sheets) {
      const prefix = `Sheet "${sheet.master_group.name}": `;

      if (!this.isIgnorableSheet(sheet)) {
        await this.collect(
          failures,
          () =>
            this.ordersValidationService.validateMorningEntriesComplete(
              sheet.id,
              db,
            ),
          prefix,
        );

        await this.collect(
          failures,
          () =>
            this.ordersValidationService.validateQuantitySanity(sheet.id, db),
          prefix,
        );
      }

      await this.collect(
        failures,
        () =>
          this.collectionsValidationService.validateMorningCollections(
            sheet.id,
            db,
          ),
        prefix,
      );
    }

    if (options.includeVehicleAllocation) {
      await this.collect(failures, () =>
        this.vehicleAllocationValidationService.validateVehicleAllocationsForMorningSubmit(
          paperId,
          db,
        ),
      );
    }

    await this.collect(failures, () =>
      this.purchaseValidationService.validatePurchasesComplete(paperId, db),
    );

    await this.collect(failures, () =>
      this.dairyTraysValidationService.validateDairyTraysComplete(paperId, db),
    );

    await this.collect(failures, () =>
      this.distributorTransferValidationService.validateGenerationReadiness(
        paperId,
        db,
      ),
    );

    await this.collect(failures, () =>
      this.cashSettlementValidationService.validateMorningSubmitReadiness(
        paperId,
        db,
      ),
    );
  }
}