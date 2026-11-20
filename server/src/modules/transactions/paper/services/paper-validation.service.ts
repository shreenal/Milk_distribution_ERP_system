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

type PaperSheet = Awaited<
  ReturnType<PaperRepository['getPaperSheets']>
>[number];

type PaperWithSheets = NonNullable<
  Awaited<ReturnType<PaperRepository['findPaperById']>>
>;

export type PaperAction = 'SUBMIT_NIGHT' | 'SUBMIT_MORNING' | 'FINALIZE';

// PA-19.5: a step the user must take, given as data so the screen never has to
// parse message text.
export type PaperRequiredAction = 'SIGN_OFF_ZERO_ALLOCATION';

// PA-19.5: shown in DRAFT readiness only. The sign-off cannot be recorded in
// DRAFT (PD-66), and a MORNING allocation may still be saved, so it is a
// warning and never a problem.
const ZERO_ALLOCATION_DRAFT_WARNING =
  'Purchase: no vehicle allocation exists yet. If none is saved, a zero-allocation sign-off is required after night submit and before morning submit';

// PA-19: what the next action would find, without doing it.
export type PaperReadiness = {
  paperId: number;
  status: OrderPaperStatus;
  action: PaperAction | null;
  ready: boolean;
  problems: string[];
  warnings: string[];
  requiredActions: PaperRequiredAction[];
};

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

  private unique(items: string[]): string[] {
    return [...new Set(items)];
  }

  private throwIfAny(
    message: string,
    failures: string[],
    extra: Record<string, unknown> = {},
  ): void {
    const details = this.unique(failures);
    if (details.length > 0) {
      throw new BadRequestException({ message, details, ...extra });
    }
  }

  // PA-19.5 / PD-70: same test the Purchase gate uses for
  // zeroAllocationSignOffRequired, reported as data.
  private async collectRequiredActions(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<PaperRequiredAction[]> {
    return (await this.purchaseValidationService.isZeroAllocationSignOffPending(
      paperId,
      db,
    ))
      ? ['SIGN_OFF_ZERO_ALLOCATION']
      : [];
  }

  private async findPaperOrThrow(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.paperRepository.findPaperById(paperId, db);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    return paper;
  }

  // ---------------------------------------------------------------------
  // Sheets that need no orders check
  //
  // PA-6.5 / PA-17.2 (night): a sheet is exempt from "at least one order"
  // when it is marked no-operation, or when its group is deactivated and it
  // has no line at all. A sheet that has lines is never exempt by the
  // deactivation rule, so recorded data is not left unchecked.
  //
  // PA-7.5 / PA-17.3 (morning): the checks are about lines that exist. A sheet
  // with no line at all is exempt when it is marked no-operation or its group
  // is deactivated. A marked sheet that HAS lines (for example morning-created)
  // is validated like any other.
  // ---------------------------------------------------------------------

  private skipsNightOrdersCheck(sheet: PaperSheet): boolean {
    return (
      sheet.no_operation ||
      (!sheet.master_group.is_active && sheet._count.order_sheet_items === 0)
    );
  }

  private skipsMorningOrdersCheck(sheet: PaperSheet): boolean {
    return (
      sheet._count.order_sheet_items === 0 &&
      (sheet.no_operation || !sheet.master_group.is_active)
    );
  }

  // ---------------------------------------------------------------------
  // Night submit
  // ---------------------------------------------------------------------

  private async collectNightFailures(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<string[]> {
    const sheets = await this.paperRepository.getPaperSheets(paperId, db);
    const failures: string[] = [];

    for (const sheet of sheets) {
      const name = sheet.master_group.name;

      if (!this.skipsNightOrdersCheck(sheet)) {
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

    return failures;
  }

  async validateNightSubmitReadiness(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.findPaperOrThrow(paperId, db);

    if (paper.status !== OrderPaperStatus.DRAFT) {
      throw new ConflictException(
        ERROR_MESSAGES.NIGHT_ALREADY_SUBMITTED(paper.status),
      );
    }

    this.throwIfAny(
      ERROR_MESSAGES.NIGHT_NOT_READY,
      await this.collectNightFailures(paperId, db),
    );

    return paper;
  }

  // ---------------------------------------------------------------------
  // Morning submit
  // ---------------------------------------------------------------------

  private async collectMorningFailures(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<string[]> {
    const failures: string[] = [];
    await this.runCompletionValidations(paperId, db, failures, {
      includeVehicleAllocation: true,
      includeCashSettlement: true,
    });
    return failures;
  }

  async validateMorningSubmitReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const paper = await this.findPaperOrThrow(paperId, db);

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

    const failures = await this.collectMorningFailures(paperId, db);

    this.throwIfAny(
      ERROR_MESSAGES.MORNING_NOT_READY,
      failures,
      // PA-19.5: only worth computing when the submit is blocked.
      failures.length > 0
        ? { requiredActions: await this.collectRequiredActions(paperId, db) }
        : {},
    );

    return paper;
  }

  // ---------------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------------

  /**
   * PA-8.2 / PA-8.4: the nearest earlier paper must be FINALIZED and must not
   * have a FAILED propagation. Returns the blocking message, or null.
   */
  private async getPreviousPaperBlock(
    saleDate: Date,
    db: PrismaOrTransaction,
  ): Promise<string | null> {
    const previous = await this.paperRepository.findPreviousPaper(saleDate, db);

    if (!previous) {
      return null;
    }

    if (previous.status !== OrderPaperStatus.FINALIZED) {
      return ERROR_MESSAGES.PREVIOUS_PAPER_NOT_FINALIZED(
        formatIsoDate(previous.sale_date),
        previous.status,
      );
    }

    // Only FAILED blocks. Work that is still PENDING / PROCESSING does not,
    // because every Orders, Purchase and tray save already recalculates its
    // own ledger synchronously; propagation is the safety net for later days.
    // A row an admin DISMISSED (PA-10.6) no longer counts as FAILED.
    const failed = await this.paperRepository.countFailedPropagations(
      previous.id,
      db,
    );

    if (failed > 0) {
      return ERROR_MESSAGES.PREVIOUS_PAPER_PROPAGATION_FAILED(
        formatIsoDate(previous.sale_date),
      );
    }

    return null;
  }

  /**
   * PA-8.3 / PA-8.6 / PA-8.9: the finalize checks (not including the
   * previous-paper rule).
   *
   * - MORNING_SUBMITTED: nothing can have changed since the morning submit, so
   *   only the admin collections and the transfer rules are checked.
   * - REOPENED: the completion checks run again, WITHOUT the two gates that
   *   the reopened surface cannot fix: Vehicle Allocation (locked, VA-2.4) and
   *   Cash Settlement (a client's cash can change while the counted notes and
   *   the deposits cannot). Cash Settlement is reported as warnings instead.
   */
  private async collectFinalizeChecks(
    paper: PaperWithSheets,
    db: PrismaOrTransaction,
  ): Promise<{ failures: string[]; warnings: string[] }> {
    const failures: string[] = [];
    const warnings: string[] = [];
    const reopened = paper.status === OrderPaperStatus.REOPENED;

    if (reopened) {
      await this.runCompletionValidations(paper.id, db, failures, {
        includeVehicleAllocation: false,
        includeCashSettlement: false,
      });
    } else {
      // PA-8.10: finalize rebuilds the distributor transfers, so a missing
      // transfer rule is reported here with every other problem instead of as
      // a lone error from the transfer step. (Already part of the completion
      // checks for a REOPENED paper.)
      await this.collect(failures, () =>
        this.distributorTransferValidationService.validateGenerationReadiness(
          paper.id,
          db,
        ),
      );
    }

    const sheets = await this.paperRepository.getPaperSheets(paper.id, db);

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

    if (reopened) {
      warnings.push(...(await this.collectCashWarnings(paper.id, db)));
    }

    return { failures, warnings };
  }

  // PA-8.9: the same route and deposit checks Cash Settlement applies at
  // morning submit, reported but never blocking.
  private async collectCashWarnings(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<string[]> {
    const cashPaper =
      await this.cashSettlementValidationService.getCashSettlementPaper(
        paperId,
        db,
      );
    const status =
      this.cashSettlementValidationService.getSubmissionStatus(cashPaper);

    return [...status.routeMismatches, ...status.depositProblems].map(
      (m) => `Cash settlement: ${m}`,
    );
  }

  async validateFinalizeReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<{ paper: PaperWithSheets; warnings: string[] }> {
    const paper = await this.findPaperOrThrow(paperId, db);

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
    const block = await this.getPreviousPaperBlock(paper.sale_date, db);
    if (block) {
      throw new ConflictException(block);
    }

    const { failures, warnings } = await this.collectFinalizeChecks(paper, db);
    this.throwIfAny(ERROR_MESSAGES.FINALIZE_NOT_READY, failures);

    return { paper, warnings };
  }

  // ---------------------------------------------------------------------
  // Readiness (PA-19): the same checks, nothing committed
  // ---------------------------------------------------------------------

  async getReadiness(
    paperId: number,
    db: PrismaOrTransaction,
  ): Promise<PaperReadiness> {
    const paper = await this.findPaperOrThrow(paperId, db);

    const result = (
      action: PaperAction | null,
      problems: string[],
      warnings: string[] = [],
      requiredActions: PaperRequiredAction[] = [],
    ): PaperReadiness => {
      const unique = this.unique(problems);
      return {
        paperId: paper.id,
        status: paper.status,
        action,
        ready: action !== null && unique.length === 0,
        problems: unique,
        warnings,
        requiredActions,
      };
    };

    switch (paper.status) {
      case OrderPaperStatus.DRAFT: {
        const signOffPending =
          await this.purchaseValidationService.isZeroAllocationSignOffPending(
            paper.id,
            db,
          );
        return result(
          'SUBMIT_NIGHT',
          await this.collectNightFailures(paper.id, db),
          signOffPending ? [ZERO_ALLOCATION_DRAFT_WARNING] : [],
        );
      }

      case OrderPaperStatus.NIGHT_SUBMITTED:
        return result(
          'SUBMIT_MORNING',
          await this.collectMorningFailures(paper.id, db),
          [],
          await this.collectRequiredActions(paper.id, db),
        );

      case OrderPaperStatus.MORNING_SUBMITTED:
      case OrderPaperStatus.REOPENED: {
        const block = await this.getPreviousPaperBlock(paper.sale_date, db);
        const { failures, warnings } = await this.collectFinalizeChecks(
          paper,
          db,
        );
        return result(
          'FINALIZE',
          block ? [block, ...failures] : failures,
          warnings,
        );
      }

      default:
        // FINALIZED: there is no further submit or finalize action.
        return result(null, []);
    }
  }

  // ---------------------------------------------------------------------
  // Completion checks (morning submit, re-finalize of a REOPENED paper)
  // ---------------------------------------------------------------------

  private async runCompletionValidations(
    paperId: number,
    db: PrismaOrTransaction,
    failures: string[],
    options: {
      includeVehicleAllocation: boolean;
      includeCashSettlement: boolean;
    },
  ): Promise<void> {
    const sheets = await this.paperRepository.getPaperSheets(paperId, db);

    for (const sheet of sheets) {
      const prefix = `Sheet "${sheet.master_group.name}": `;

      if (!this.skipsMorningOrdersCheck(sheet)) {
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

    if (options.includeCashSettlement) {
      await this.collect(failures, () =>
        this.cashSettlementValidationService.validateMorningSubmitReadiness(
          paperId,
          db,
        ),
      );
    }
  }
}
