import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DATE_CONFIG,
  ERROR_MESSAGES,
  PAPER_TRANSACTION_TIMEOUT_MS,
} from './paper.constants.js';
import { PaperValidationService } from './services/paper-validation.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { PaperAuditEntry, PaperRepository } from './paper.repository.js';
import {
  OrderPaperStatus,
  PaperAuditAction,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';
import { DairyTraysRepository } from '../dairy-trays/dairy-trays.repository.js';
import { runSerializableTransaction } from '../../../common/transactions/transaction-runner.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PropagationOutboxRepository } from '../propagation-queue/propagation-outbox.repository.js';
import { PROPAGATION_OUTBOX_PROBLEM_AFTER_MS } from '../propagation-queue/propagation-queue.constants.js';
import {
  addDaysUtc,
  formatIsoDate,
  getTodayInZone,
  parseStrictDate,
  resolveGenerationDates,
} from './paper-date.util.js';
import { GeneratePaperDto } from './dto/generate-paper.dto.js';
import { SetSheetsNoOperationDto } from './dto/set-sheets-no-operation.dto.js';
import { isUniqueViolation } from '../../../common/transactions/db-errors.js';

export type PaperActor = { id: number; role: string };

type PaperWithSheets = NonNullable<
  Awaited<ReturnType<PaperRepository['findPaperById']>>
>;

const DAY_MS = 24 * 60 * 60 * 1000;

// PA-4.6: the generation race can surface as a unique violation in several
// shapes depending on the driver; same check the repositories use.

@Injectable()
export class PaperService {
  constructor(
    private readonly paperRepository: PaperRepository,
    private readonly paperValidationService: PaperValidationService,
    private readonly workflowState: WorkflowStateService,
    private readonly workflowBuilder: WorkflowBuilder,
    private readonly prisma: PrismaService,
    private readonly dependencyOrchestrator: DependencyOrchestratorService,
    private readonly propagationOutboxRepository: PropagationOutboxRepository,
    private readonly dairyTraysRepository: DairyTraysRepository,
  ) {}

  // Additive: write endpoints used to return the bare paper row. Spreading the
  // row keeps every existing field in place and adds `workflow`, so callers
  // no longer need a follow-up GET to know what they may do next.
  private withWorkflow<T extends { status: OrderPaperStatus }>(paper: T) {
    return {
      ...paper,
      workflow: this.workflowBuilder.buildPaperWorkflow(paper.status),
    };
  }

  // PA-8.5 / PA-9.4: finalize and reopen also report background propagation,
  // so FINALIZED is never read as "everything downstream is already settled".
  private async withWorkflowAndPropagation<
    T extends { id: number; status: OrderPaperStatus },
  >(paper: T) {
    return {
      ...this.withWorkflow(paper),
      propagation: await this.propagationOutboxRepository.summarizeForPaper(
        paper.id,
      ),
    };
  }

  private async paperView(paper: PaperWithSheets) {
    return {
      paper,
      workflow: this.workflowBuilder.buildPaperWorkflow(paper.status),
      propagation: await this.propagationOutboxRepository.summarizeForPaper(
        paper.id,
      ),
    };
  }

  // PA-11.3: every Paper write runs as one serializable transaction. A
  // transaction that times out saved nothing; that is reported as a retryable
  // 409 instead of a generic 500 (all Paper writes, PA-14.2). The three heavy
  // actions pass the longer paper-specific limit.
  private runPaperTransaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    // PA-11.3: the timeout-to-409 mapping now lives in runSerializableTransaction.
    return runSerializableTransaction(this.prisma, run, {
      timeoutMs: options.timeoutMs,
    });
  }

  // PA-20: written in the same transaction as the action it records.
  private audit(
    tx: Prisma.TransactionClient,
    actor: PaperActor,
    entry: Omit<PaperAuditEntry, 'userId'>,
  ) {
    return this.paperRepository.createAuditLog(
      { ...entry, userId: actor.id },
      tx,
    );
  }

  // PA-4.4: while a paper is still DRAFT, a group that became active after
  // generation gets its sheet when generate is pressed again. Existing sheets
  // are never changed or removed, and a paper past DRAFT is returned as is.
  // The addition is audited (PA-4.4 / PA-20.1) as GENERATED with
  // `existingPaper: true`; a call that adds nothing writes nothing.
  private async addMissingSheetsWhileDraft(
    paper: PaperWithSheets,
    tx: Prisma.TransactionClient,
    actor: PaperActor,
  ): Promise<PaperWithSheets> {
    if (paper.status !== OrderPaperStatus.DRAFT) {
      return paper;
    }

    const groups = await this.paperRepository.getActiveGroups(tx);
    const haveSheet = new Set(paper.order_sheet.map((s) => s.group_id));
    const missing = groups.filter((g) => !haveSheet.has(g.id));

    if (missing.length === 0) {
      return paper;
    }

    await this.paperRepository.generateOrderSheets(paper.id, missing, tx);

    await this.audit(tx, actor, {
      paperId: paper.id,
      action: PaperAuditAction.GENERATED,
      fromStatus: paper.status,
      toStatus: paper.status,
      details: {
        saleDate: formatIsoDate(paper.sale_date),
        existingPaper: true,
        sheetsAdded: missing.length,
        groupIds: missing.map((g) => g.id),
      },
    });

    return (await this.paperRepository.findPaperById(paper.id, tx)) ?? paper;
  }

  // PA-4.8 / PA-4.9: a paper for a date before the ordering date.
  private assertBackfillAllowed(
    targetSaleDate: Date,
    latestSaleDate: Date,
    reason: string | undefined,
    actor: PaperActor,
  ): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException(ERROR_MESSAGES.BACKFILL_ADMIN_ONLY);
    }

    if (!reason) {
      throw new BadRequestException(ERROR_MESSAGES.BACKFILL_REASON_REQUIRED);
    }

    const daysBack = Math.round(
      (latestSaleDate.getTime() - targetSaleDate.getTime()) / DAY_MS,
    );

    if (daysBack > DATE_CONFIG.MAX_BACKDATE_DAYS) {
      throw new BadRequestException(
        ERROR_MESSAGES.BACKFILL_TOO_OLD(DATE_CONFIG.MAX_BACKDATE_DAYS),
      );
    }
  }

  async generatePaperService(dto: GeneratePaperDto, actor: PaperActor) {
    // latestSaleDate = tomorrow (IST): the ordering paper. Without `date` that
    // is what is generated. An earlier date is a backfill (PA-4.8); a later
    // one is rejected.
    const { saleDate: latestSaleDate } = resolveGenerationDates(
      new Date(),
      DATE_CONFIG.TIMEZONE,
      DATE_CONFIG.GENERATION_SALE_DATE_OFFSET_DAYS,
    );

    let targetSaleDate = latestSaleDate;

    if (dto.date !== undefined) {
      const requested = parseStrictDate(dto.date);

      if (!requested) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT);
      }

      if (requested.getTime() > latestSaleDate.getTime()) {
        throw new BadRequestException(
          ERROR_MESSAGES.FUTURE_DATE_NOT_ALLOWED(formatIsoDate(latestSaleDate)),
        );
      }

      targetSaleDate = requested;
    }

    const isBackfill = targetSaleDate.getTime() < latestSaleDate.getTime();
    const orderDate = addDaysUtc(
      targetSaleDate,
      -DATE_CONFIG.GENERATION_SALE_DATE_OFFSET_DAYS,
    );
    const nextSaleDay = addDaysUtc(targetSaleDate, 1);

    const paper = await this.runPaperTransaction(async (tx) => {
      const existingPaper = await this.paperRepository.findPaperBySaleDate(
        targetSaleDate,
        nextSaleDay,
        tx,
      );

      // Idempotent (PA-4.3): an existing paper is returned to anyone, for any
      // allowed date. Only creating a past paper needs the admin rules.
      if (existingPaper) {
        return this.addMissingSheetsWhileDraft(existingPaper, tx, actor);
      }

      if (isBackfill) {
        this.assertBackfillAllowed(
          targetSaleDate,
          latestSaleDate,
          dto.reason,
          actor,
        );
      }

      const created = await this.paperRepository.createPaper(
        orderDate,
        targetSaleDate,
        tx,
      );

      const groups = await this.paperRepository.getActiveGroups(tx);

      if (!groups || groups.length === 0) {
        throw new BadRequestException(ERROR_MESSAGES.NO_ACTIVE_GROUPS);
      }

      await this.paperRepository.generateOrderSheets(created.id, groups, tx);

      await this.dairyTraysRepository.getOrCreateDairyTrayPaper(created.id, tx);

      // Same shape as the "already exists" path (paper + sheets).
      const withSheets = await this.paperRepository.findPaperById(
        created.id,
        tx,
      );

      if (!withSheets) {
        throw new Error(
          `Paper ${created.id} vanished inside its own transaction`,
        );
      }

      await this.audit(tx, actor, {
        paperId: created.id,
        action: isBackfill
          ? PaperAuditAction.GENERATED_BACKFILL
          : PaperAuditAction.GENERATED,
        toStatus: OrderPaperStatus.DRAFT,
        reason: isBackfill ? dto.reason : null,
        details: {
          saleDate: formatIsoDate(targetSaleDate),
          sheets: groups.length,
        },
      });

      return withSheets;
    }).catch(async (err: unknown) => {
      // Two concurrent requests for the same date can both pass the
      // existingPaper check and race on the unique (sale_date/order_date)
      // constraint. Generation is idempotent per date, so resolve that case
      // by returning the winner's paper. The re-query by sale date is the
      // guard: a different unique violation finds no paper and is rethrown.
      if (isUniqueViolation(err)) {
        const existingPaper = await this.paperRepository.findPaperBySaleDate(
          targetSaleDate,
          nextSaleDay,
        );
        if (existingPaper) {
          return existingPaper;
        }
      }
      throw err;
    });

    return this.withWorkflow(paper);
  }

  // PA-5.1: the two papers that are alive today, by name. `delivery` is being
  // completed today (sale date today, generated yesterday). `ordering` is being
  // ordered today (sale date tomorrow). Each is null if it does not exist.
  async getCurrentPapersService() {
    const today = getTodayInZone(new Date(), DATE_CONFIG.TIMEZONE);
    const tomorrow = addDaysUtc(today, 1);
    const dayAfter = addDaysUtc(today, 2);

    const [delivery, ordering] = await Promise.all([
      this.paperRepository.findPaperBySaleDate(today, tomorrow),
      this.paperRepository.findPaperBySaleDate(tomorrow, dayAfter),
    ]);

    return {
      dates: {
        delivery: formatIsoDate(today),
        ordering: formatIsoDate(tomorrow),
      },
      delivery: delivery ? await this.paperView(delivery) : null,
      ordering: ordering ? await this.paperView(ordering) : null,
    };
  }

  private async findPaperOrThrow(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    return paper;
  }

  async getPaperByIdService(paperId: number) {
    return this.paperView(await this.findPaperOrThrow(paperId));
  }

  async getPapersService(date?: string, page = 1, pageSize?: number) {
    if (date) {
      const start = parseStrictDate(date);

      if (!start) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT);
      }

      const end = addDaysUtc(start, 1);

      const paper = await this.paperRepository.findPaperBySaleDate(start, end);

      if (!paper) {
        throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
      }

      return this.paperView(paper);
    }

    const {
      papers,
      total,
      page: appliedPage,
      pageSize: appliedPageSize,
    } = await this.paperRepository.findAllPapers(page, pageSize);

    return {
      total,
      page: appliedPage,
      pageSize: appliedPageSize,
      items: papers.map((paper) => ({
        paper,
        workflow: this.workflowBuilder.buildPaperWorkflow(paper.status),
      })),
    };
  }

  // PA-19: read-only. The checks never write, so a repeatable-read snapshot is
  // enough and it never competes with employees' saves the way a serializable
  // transaction can.
  async getReadinessService(paperId: number) {
    return this.prisma.$transaction(
      (tx) => this.paperValidationService.getReadiness(paperId, tx),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: PAPER_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  async submitNightEntryService(paperId: number, actor: PaperActor) {
    const paper = await this.runPaperTransaction(
      async (tx) => {
        const current =
          await this.paperValidationService.validateNightSubmitReadiness(
            paperId,
            tx,
          );

        this.workflowState.validateTransition(
          current.status,
          OrderPaperStatus.NIGHT_SUBMITTED,
        );

        const updated = await this.paperRepository.submitNightEntry(
          paperId,
          tx,
        );

        await this.audit(tx, actor, {
          paperId,
          action: PaperAuditAction.NIGHT_SUBMITTED,
          fromStatus: current.status,
          toStatus: OrderPaperStatus.NIGHT_SUBMITTED,
        });

        return updated;
      },
      { timeoutMs: PAPER_TRANSACTION_TIMEOUT_MS },
    );

    return this.withWorkflow(paper);
  }

  async submitMorningEntryService(paperId: number, actor: PaperActor) {
    const paper = await this.runPaperTransaction(
      async (tx) => {
        const current =
          await this.paperValidationService.validateMorningSubmitReadiness(
            paperId,
            tx,
          );

        this.workflowState.validateTransition(
          current.status,
          OrderPaperStatus.MORNING_SUBMITTED,
        );

        const updated = await this.paperRepository.submitMorningEntry(
          paperId,
          tx,
        );

        await this.audit(tx, actor, {
          paperId,
          action: PaperAuditAction.MORNING_SUBMITTED,
          fromStatus: current.status,
          toStatus: OrderPaperStatus.MORNING_SUBMITTED,
        });

        return updated;
      },
      { timeoutMs: PAPER_TRANSACTION_TIMEOUT_MS },
    );

    return this.withWorkflow(paper);
  }

  async finalizePaperService(paperId: number, actor: PaperActor) {
    const { paper, warnings } = await this.runPaperTransaction(
      async (tx) => {
        const { paper: current, warnings } =
          await this.paperValidationService.validateFinalizeReadiness(
            paperId,
            tx,
          );

        this.workflowState.validateTransition(
          current.status,
          OrderPaperStatus.FINALIZED,
        );

        // Financial finalization is synchronous. Downstream tray
        // propagation is recorded in the outbox in this same transaction
        // and completes asynchronously; its progress is returned with the
        // response and tracked separately (see getPropagationStatusService).
        await this.dependencyOrchestrator.execute(
          DEPENDENCY_MODULES.PAPER,
          DEPENDENCY_TRIGGERS.ON_FINALIZE,
          {
            paperId,
            tx,
          },
        );

        const finalized = await this.paperRepository.finalizePaper(paperId, tx);

        // PA-8.9: warnings the admin finalized through are part of the record.
        await this.audit(tx, actor, {
          paperId,
          action: PaperAuditAction.FINALIZED,
          fromStatus: current.status,
          toStatus: OrderPaperStatus.FINALIZED,
          details: warnings.length > 0 ? { warnings } : undefined,
        });

        return { paper: finalized, warnings };
      },
      { timeoutMs: PAPER_TRANSACTION_TIMEOUT_MS },
    );

    return { ...(await this.withWorkflowAndPropagation(paper)), warnings };
  }

  async reopenPaperService(paperId: number, reason: string, actor: PaperActor) {
    const paper = await this.runPaperTransaction(async (tx) => {
      const current = await this.paperRepository.findPaperById(paperId, tx);

      if (!current) {
        throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
      }

      if (current.status === OrderPaperStatus.REOPENED) {
        throw new ConflictException(ERROR_MESSAGES.ALREADY_REOPENED);
      }

      this.workflowState.validateTransition(
        current.status,
        OrderPaperStatus.REOPENED,
      );

      const reopened = await this.paperRepository.reopenPaper(
        paperId,
        reason,
        tx,
      );

      await this.audit(tx, actor, {
        paperId,
        action: PaperAuditAction.REOPENED,
        fromStatus: current.status,
        toStatus: OrderPaperStatus.REOPENED,
        reason,
      });

      return reopened;
    });

    return this.withWorkflowAndPropagation(paper);
  }

  // PA-18: ADMIN steps a MORNING_SUBMITTED paper back to NIGHT_SUBMITTED.
  async revertMorningSubmitService(
    paperId: number,
    reason: string,
    actor: PaperActor,
  ) {
    const paper = await this.runPaperTransaction(async (tx) => {
      const current = await this.paperRepository.findPaperById(paperId, tx);

      if (!current) {
        throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
      }

      if (current.status !== OrderPaperStatus.MORNING_SUBMITTED) {
        throw new BadRequestException(
          ERROR_MESSAGES.REVERT_ONLY_MORNING_SUBMITTED(current.status),
        );
      }

      this.workflowState.validateTransition(
        current.status,
        OrderPaperStatus.NIGHT_SUBMITTED,
      );

      const reverted = await this.paperRepository.revertMorningSubmit(
        paperId,
        tx,
      );

      await this.audit(tx, actor, {
        paperId,
        action: PaperAuditAction.MORNING_REVERTED,
        fromStatus: current.status,
        toStatus: OrderPaperStatus.NIGHT_SUBMITTED,
        reason,
      });

      return reverted;
    });

    return this.withWorkflow(paper);
  }

  // PA-17: mark (or unmark) routes that have no business on this paper.
  async setSheetsNoOperationService(
    paperId: number,
    dto: SetSheetsNoOperationDto,
    actor: PaperActor,
  ) {
    await this.runPaperTransaction(async (tx) => {
      const paper = await this.paperRepository.findPaperById(paperId, tx);

      if (!paper) {
        throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
      }

      if (paper.status !== OrderPaperStatus.DRAFT) {
        throw new BadRequestException(
          ERROR_MESSAGES.NO_OPERATION_ONLY_DRAFT(paper.status),
        );
      }

      const found = await this.paperRepository.findSheetIdsInPaper(
        paperId,
        dto.sheetIds,
        tx,
      );
      const foundIds = new Set(found.map((s) => s.id));
      const missing = dto.sheetIds.filter((id) => !foundIds.has(id));

      if (missing.length > 0) {
        throw new BadRequestException(
          ERROR_MESSAGES.SHEETS_NOT_IN_PAPER(missing, paperId),
        );
      }

      const changed = await this.paperRepository.setSheetsNoOperation(
        paperId,
        dto.sheetIds,
        dto.noOperation,
        tx,
      );

      // Setting a value that is already set changes and records nothing.
      if (changed > 0) {
        const requested = new Set(dto.sheetIds);

        await this.audit(tx, actor, {
          paperId,
          action: PaperAuditAction.SHEET_OPERATION_CHANGED,
          fromStatus: paper.status,
          toStatus: paper.status,
          details: {
            noOperation: dto.noOperation,
            changed,
            sheetIds: dto.sheetIds,
            routes: paper.order_sheet
              .filter((s) => requested.has(s.id))
              .map((s) => s.master_group.name),
          },
        });
      }
    });

    return this.getPaperByIdService(paperId);
  }

  async getPropagationStatusService(paperId: number) {
    await this.findPaperOrThrow(paperId);
    return this.propagationOutboxRepository.summarizeForPaper(paperId);
  }

  async retryFailedPropagationService(paperId: number, actor: PaperActor) {
    await this.findPaperOrThrow(paperId);

    const requeued = await this.prisma.$transaction(async (tx) => {
      const count =
        await this.propagationOutboxRepository.requeueFailedForPaper(
          paperId,
          tx,
        );

      if (count > 0) {
        await this.audit(tx, actor, {
          paperId,
          action: PaperAuditAction.PROPAGATION_RETRIED,
          details: { requeued: count },
        });
      }

      return count;
    });

    return { requeued };
  }

  // PA-10.6: an admin gives up on FAILED propagation rows. They are kept
  // (status DISMISSED) with their error, and stop blocking the next finalize.
  async dismissFailedPropagationService(
    paperId: number,
    reason: string,
    actor: PaperActor,
  ) {
    await this.findPaperOrThrow(paperId);

    const dismissed = await this.prisma.$transaction(async (tx) => {
      const rows = await this.propagationOutboxRepository.dismissFailedForPaper(
        paperId,
        tx,
      );

      if (rows.length > 0) {
        await this.audit(tx, actor, {
          paperId,
          action: PaperAuditAction.PROPAGATION_DISMISSED,
          reason,
          details: {
            dismissed: rows.map((r) => ({
              id: r.id,
              type: r.type,
              lastError: r.last_error,
            })),
          },
        });
      }

      return rows.length;
    });

    return { dismissed };
  }

  async listPropagationProblemsService() {
    return this.propagationOutboxRepository.listProblems(
      PROPAGATION_OUTBOX_PROBLEM_AFTER_MS,
    );
  }

  // PA-20
  async getAuditLogService(paperId: number) {
    await this.findPaperOrThrow(paperId);
    return this.paperRepository.listAuditLog(paperId);
  }
}
