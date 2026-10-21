import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderPaperStatus, Prisma } from '../../../generated/prisma/client.js';
import { DairyTraysValidationService } from './services/dairy-trays-validation.service.js';
import { DairyTraysLedgerService } from './services/dairy-trays-ledger.service.js';
import { DairyTraysBuilder } from './dairy-trays.builder.js';
import { DairyTraysRepository } from './dairy-trays.repository.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { SaveDairyTrayEntriesDto } from './dto/save-dairy-tray-entries.dto.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { DairyTraysPropagationService } from './services/dairy-trays-propagation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { PropagationOutboxRepository } from '../propagation-queue/propagation-outbox.repository.js';
import { PROPAGATION_OUTBOX_TYPES } from '../propagation-queue/propagation-queue.constants.js';
import { parseStrictDate } from '../paper/paper-date.util.js';
import {
  DAIRY_TRAYS_ERROR_MESSAGES as MSG,
  DAIRY_TRAY_TRACKING_SUCCESS_MESSAGES,
  MAX_RECALCULATION_RANGE_DAYS,
  STALE_DATA_MESSAGE,
} from './dairy-trays.constants.js';
import { buildDairyTrayKey } from './dairy-trays.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DairyTraysService {
  private readonly logger = new Logger(DairyTraysService.name);

  constructor(
    private readonly dairyTraysRepository: DairyTraysRepository,
    private readonly dairytraysBuilder: DairyTraysBuilder,
    private readonly dairytraysValidationService: DairyTraysValidationService,
    private readonly ledgerService: DairyTraysLedgerService,
    private readonly workflowStateService: WorkflowStateService,
    private readonly workflowBuilder: WorkflowBuilder,
    private readonly dairyTraysPropagationService: DairyTraysPropagationService,
    private readonly propagationOutboxRepository: PropagationOutboxRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * DT-3: strictly read-only. It never creates the dairy tray header (DT-3.3);
   * with no header the grid is still calculated live and the token is null.
   */
  async getDairyTrayGrid(paperId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const paper = await this.dairyTraysRepository.findPaperById(
          paperId,
          tx,
        );

        if (!paper) {
          throw new NotFoundException(MSG.PAPER_NOT_FOUND);
        }

        const dairyTrayPaper =
          await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
            paperId,
            tx,
          );

        const ledger = await this.ledgerService.loadLedger(
          paper,
          dairyTrayPaper?.id ?? null,
          tx,
        );

        const workflow = this.workflowBuilder.buildDairyTrayTrackingWorkflow(
          paper.status,
        );

        const grid = this.dairytraysBuilder.buildDairyTrayGrid({
          vehicles: ledger.vehicles,
          trayTypes: ledger.trayTypes,
          ledgerLines: ledger.lines,
        });

        return {
          paper,
          workflow,
          // DT-9.1: the header's own token. Send it back as expectedUpdatedAt.
          dairyTraysUpdatedAt: dairyTrayPaper?.updated_at.toISOString() ?? null,
          ...grid,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
      },
    );
  }

  private parseExpected(expected: string | null): Date | null {
    if (expected === null) return null;

    const date = new Date(expected);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(MSG.INVALID_EXPECTED_UPDATED_AT);
    }

    return date;
  }

  /**
   * DT-5: order of checks inside the transaction:
   * paper exists (404) -> status allows editing (400) -> header exists (400)
   * -> token (409) -> entries validated against the server's own ledger (400)
   * -> no conflicting stored return anywhere (409) -> write -> on a REOPENED
   * paper, forward conflict check (409) and a queued cascade.
   *
   * `reconcileInactive` is true only from the admin route (DT-5.11).
   */
  async saveDairyTrayEntries(
    paperId: number,
    dto: SaveDairyTrayEntriesDto,
    options: { reconcileInactive?: boolean } = {},
  ) {
    // Request-shape checks run before the transaction starts (DT-4.7).
    this.dairytraysValidationService.validateNoDuplicateEntries(dto.entries);
    const expected = this.parseExpected(dto.expectedUpdatedAt);

    const dairyTraysUpdatedAt = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const paper = await this.dairyTraysRepository.findPaperById(
            paperId,
            tx,
          );

          if (!paper) {
            throw new NotFoundException(MSG.PAPER_NOT_FOUND);
          }

          if (!this.workflowStateService.canEditDairyTrays(paper.status)) {
            throw new BadRequestException(MSG.EDIT_NOT_ALLOWED);
          }

          // GET never creates the header (DT-3.3), and a save must not either.
          const dairyTrayPaper =
            await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
              paperId,
              tx,
            );

          if (!dairyTrayPaper) {
            throw new BadRequestException(MSG.DAIRY_TRAY_PAPER_NOT_FOUND);
          }

          // DT-9.2: the header always has a token, so an explicit null can
          // never match: it is the normal stale conflict.
          if (expected === null) {
            throw new ConflictException(STALE_DATA_MESSAGE);
          }

          const touch =
            await this.dairyTraysRepository.touchDairyTrayPaperIfTokenMatches(
              dairyTrayPaper.id,
              expected,
              tx,
            );

          if (touch.count !== 1) {
            throw new ConflictException(STALE_DATA_MESSAGE);
          }

          // Everything is validated against the server's own numbers.
          const ledger = await this.ledgerService.loadLedger(
            paper,
            dairyTrayPaper.id,
            tx,
          );

          this.dairytraysValidationService.validateReturnEntries(
            dto.entries,
            ledger,
            options.reconcileInactive === true,
          );

          // DT-4.6: rows not in the request keep their stored return;
          // submitted entries override.
          const returnedByKey = new Map(ledger.returnedByKey);

          for (const entry of dto.entries) {
            returnedByKey.set(buildDairyTrayKey(entry), entry.returned);
          }

          // DT-6.5: never leave any stored return above its balance.
          await this.ledgerService.assertNoReturnConflicts(
            ledger.openingBalances,
            ledger.takenByKey,
            returnedByKey,
            paper.sale_date,
            tx,
          );

          const lines = this.ledgerService.buildLedger(
            ledger.openingBalances,
            ledger.takenByKey,
            returnedByKey,
          );

          await this.dairyTraysRepository.replaceTrayTransactions(
            dairyTrayPaper.id,
            lines.map((line) =>
              this.ledgerService.toTransactionInput(dairyTrayPaper.id, line),
            ),
            tx,
          );

          // DT-10.2: on a reopened paper a changed closing balance must reach
          // later papers. Refuse the save if a later paper could no longer
          // cover its own returns, otherwise queue the forward cascade.
          if (paper.status === OrderPaperStatus.REOPENED) {
            await this.dairyTraysPropagationService.assertNoForwardReturnConflicts(
              paper.id,
              tx,
            );

            await this.propagationOutboxRepository.enqueue(
              PROPAGATION_OUTBOX_TYPES.DAIRY_TRAYS_FORWARD,
              paper.id,
              null,
              tx,
            );
          }

          // DT-9.4: the caller needs the new token to save again.
          return touch.touchedAt.toISOString();
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    return {
      success: true,
      message: DAIRY_TRAY_TRACKING_SUCCESS_MESSAGES.TRAY_RETURNS_SAVED,
      dairyTraysUpdatedAt,
    };
  }

  /**
   * DT-11: administrative recalculation over a sale-date window. Each paper in
   * the window gets the existing forward propagation job; it runs in the
   * background and is followed through the paper propagation status endpoints.
   */
  async requestRangeRecalculationService(fromDate: string, toDate: string) {
    const from = parseStrictDate(fromDate);
    const to = parseStrictDate(toDate);

    if (!from || !to) {
      throw new BadRequestException(MSG.INVALID_DATE_RANGE);
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException(MSG.DATE_RANGE_ORDER);
    }

    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;

    if (days > MAX_RECALCULATION_RANGE_DAYS) {
      throw new BadRequestException(
        MSG.DATE_RANGE_TOO_LONG(MAX_RECALCULATION_RANGE_DAYS),
      );
    }

    const papers = await this.dairyTraysRepository.findPapersBySaleDateRange(
      from,
      to,
    );

    const operations = await this.prisma.$transaction(async (tx) => {
      const queued: { paperId: number; operationId: number }[] = [];

      for (const paper of papers) {
        const row = await this.propagationOutboxRepository.enqueue(
          PROPAGATION_OUTBOX_TYPES.DAIRY_TRAYS_FORWARD,
          paper.id,
          null,
          tx,
        );

        queued.push({ paperId: paper.id, operationId: row.id });
      }

      return queued;
    });

    this.logger.log(
      `Dairy trays recalculation queued for ${operations.length} paper(s), ${fromDate} to ${toDate}`,
    );

    return { papersQueued: operations.length, fromDate, toDate, operations };
  }
}
