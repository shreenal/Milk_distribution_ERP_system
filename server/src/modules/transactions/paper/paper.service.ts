import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DATE_CONFIG,
  ERROR_MESSAGES,
  PAPER_TRANSACTION_TIMEOUT_MS,
} from './paper.constants.js';
import { PaperValidationService } from './services/paper-validation.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { PaperRepository } from './paper.repository.js';
import { OrderPaperStatus, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';
import { DairyTraysRepository } from '../dairy-trays/dairy-trays.repository.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
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

type PaperWithSheets = NonNullable<
  Awaited<ReturnType<PaperRepository['findPaperById']>>
>;

// PA-4.6: the generation race can surface as a unique violation in several
// shapes depending on the driver; same check the repositories use.
const isUniqueViolation = (e: any): boolean =>
  e?.code === '23505' ||
  e?.code === 'P2002' ||
  e?.meta?.code === '23505' ||
  e?.cause?.originalCode === '23505' ||
  e?.meta?.driverAdapterError?.cause?.originalCode === '23505';

@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);
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

  // PA-5.1: the paper returned as LATEST is not today's paper, so it is
  // offered for viewing only. No action is advertised.
  private buildReadOnlyWorkflow(status: OrderPaperStatus) {
    return {
      ...this.workflowBuilder.buildPaperWorkflow(status),
      activeExecutionSession: null,
      canSubmitNight: false,
      canSubmitMorning: false,
      canFinalize: false,
      canReopen: false,
    };
  }

  // PA-11.3: submit-night, submit-morning and finalize run every other
  // module's checks in one serializable transaction, so they get the longer
  // paper-specific limit. A transaction that still times out saved nothing;
  // that is reported as a retryable 409 instead of a generic 500.
  private async runHeavyTransaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await withSerializableRetry(() =>
        this.prisma.$transaction(run, {
          timeout: PAPER_TRANSACTION_TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        }),
      );
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === 'P2028'
      ) {
        throw new ConflictException(ERROR_MESSAGES.TRANSACTION_TIMED_OUT);
      }
      throw err;
    }
  }

  // PA-4.4: while a paper is still DRAFT, a group that became active after
  // generation gets its sheet when generate is pressed again. Existing sheets
  // are never changed or removed, and a paper past DRAFT is returned as is.
  private async addMissingSheetsWhileDraft(
    paper: PaperWithSheets,
    tx: Prisma.TransactionClient,
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

    return (await this.paperRepository.findPaperById(paper.id, tx)) ?? paper;
  }

  async generatePaperService(date?: string) {
    // Business decision: papers are generated for the current business day
    // only. No past dates, no future dates, no "+30 days" window.
    const { orderDate, saleDate } = resolveGenerationDates(
      new Date(),
      DATE_CONFIG.TIMEZONE,
      DATE_CONFIG.GENERATION_SALE_DATE_OFFSET_DAYS,
    );

    if (date !== undefined) {
      const requested = parseStrictDate(date);

      if (!requested) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT);
      }

      if (requested.getTime() !== saleDate.getTime()) {
        throw new BadRequestException(
          ERROR_MESSAGES.ONLY_CURRENT_BUSINESS_DAY(formatIsoDate(saleDate)),
        );
      }
    }

    const nextSaleDay = addDaysUtc(saleDate, 1);

    const paper = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existingPaper = await this.paperRepository.findPaperBySaleDate(
            saleDate,
            nextSaleDay,
            tx,
          );

          if (existingPaper) {
            return this.addMissingSheetsWhileDraft(existingPaper, tx);
          }

          const created = await this.paperRepository.generatePaperFromOrderDate(
            orderDate,
            tx,
          );

          const groups = await this.paperRepository.getActiveGroups(tx);

          if (!groups || groups.length === 0) {
            throw new BadRequestException(ERROR_MESSAGES.NO_ACTIVE_GROUPS);
          }

          await this.paperRepository.generateOrderSheets(
            created.id,
            groups,
            tx,
          );

          await this.dairyTraysRepository.getOrCreateDairyTrayPaper(
            created.id,
            tx,
          );

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

          return withSheets;
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    ).catch(async (err: unknown) => {
      // Two concurrent requests for the same date can both pass the
      // existingPaper check and race on the unique (sale_date/order_date)
      // constraint. Generation is idempotent per date, so resolve that case
      // by returning the winner's paper. The re-query by sale date is the
      // guard: a different unique violation finds no paper and is rethrown.
      if (isUniqueViolation(err)) {
        const existingPaper = await this.paperRepository.findPaperBySaleDate(
          saleDate,
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

  async getTodayPaperService() {
    try {
      this.logger.log('Fetching today or latest paper');

      const today = getTodayInZone(new Date(), DATE_CONFIG.TIMEZONE);
      const tomorrow = addDaysUtc(today, 1);

      const todayPaper = await this.paperRepository.findPaperBySaleDate(
        today,
        tomorrow,
      );

      if (todayPaper) {
        return {
          type: 'TODAY',
          paper: todayPaper,
          workflow: this.workflowBuilder.buildPaperWorkflow(todayPaper.status),
          propagation: await this.propagationOutboxRepository.summarizeForPaper(
            todayPaper.id,
          ),
        };
      }

      const latestPaper = await this.paperRepository.findLatestPaper();

      if (!latestPaper) {
        throw new NotFoundException(ERROR_MESSAGES.NO_PAPERS_FOUND);
      }

      return {
        type: 'LATEST',
        paper: latestPaper,
        workflow: this.buildReadOnlyWorkflow(latestPaper.status),
        propagation: await this.propagationOutboxRepository.summarizeForPaper(
          latestPaper.id,
        ),
      };
    } catch (error) {
      this.logger.error('Failed to fetch today/latest paper', error);

      throw error;
    }
  }

  async getPaperByIdService(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    return {
      paper,
      workflow: this.workflowBuilder.buildPaperWorkflow(paper.status),
      propagation: await this.propagationOutboxRepository.summarizeForPaper(
        paper.id,
      ),
    };
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

      return {
        paper,
        workflow: this.workflowBuilder.buildPaperWorkflow(paper.status),
        propagation: await this.propagationOutboxRepository.summarizeForPaper(
          paper.id,
        ),
      };
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

  async submitNightEntryService(paperId: number) {
    const paper = await this.runHeavyTransaction(async (tx) => {
      const current =
        await this.paperValidationService.validateNightSubmitReadiness(
          paperId,
          tx,
        );

      this.workflowState.validateTransition(
        current.status,
        OrderPaperStatus.NIGHT_SUBMITTED,
      );

      return this.paperRepository.submitNightEntry(paperId, tx);
    });

    return this.withWorkflow(paper);
  }

  async submitMorningEntryService(paperId: number) {
    const paper = await this.runHeavyTransaction(async (tx) => {
      const current =
        await this.paperValidationService.validateMorningSubmitReadiness(
          paperId,
          tx,
        );

      this.workflowState.validateTransition(
        current.status,
        OrderPaperStatus.MORNING_SUBMITTED,
      );

      return this.paperRepository.submitMorningEntry(paperId, tx);
    });

    return this.withWorkflow(paper);
  }

  async finalizePaperService(paperId: number) {
    const paper = await this.runHeavyTransaction(async (tx) => {
      const current =
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

      return this.paperRepository.finalizePaper(paperId, tx);
    });

    return this.withWorkflowAndPropagation(paper);
  }

  async reopenPaperService(paperId: number, reason: string) {
    const paper = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
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

          return this.paperRepository.reopenPaper(paperId, reason, tx);
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    return this.withWorkflowAndPropagation(paper);
  }

  private async assertPaperExists(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }
  }

  async getPropagationStatusService(paperId: number) {
    await this.assertPaperExists(paperId);
    return this.propagationOutboxRepository.summarizeForPaper(paperId);
  }

  async retryFailedPropagationService(paperId: number) {
    await this.assertPaperExists(paperId);
    const requeued =
      await this.propagationOutboxRepository.requeueFailedForPaper(paperId);
    return { requeued };
  }

  async listPropagationProblemsService() {
    return this.propagationOutboxRepository.listProblems(
      PROPAGATION_OUTBOX_PROBLEM_AFTER_MS,
    );
  }
}