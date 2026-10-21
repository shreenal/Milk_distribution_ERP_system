import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ClientTraysRepository } from './client-trays.repository.js';
import { ClientTraysBuilder } from './client-trays.builder.js';
import { SaveTrayReturnDto } from './dto/save-trays-entries.dto.js';
import {
  CLIENT_TRAY_ERROR_MESSAGES,
  CLIENT_TRAY_SUCCESS_MESSAGES,
  MAX_RECALCULATION_RANGE_DAYS,
} from './client-trays.constants.js';
import { TransactionClient } from '../../../types/transaction.types.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';
import { ClientTraysValidationService } from './services/client-trays-validation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import {
  buildClientTrayKey,
  parseClientTrayKey,
} from '../../../common/utils/client-tray-key.util.js';
import { PropagationOutboxRepository } from '../propagation-queue/propagation-outbox.repository.js';
import { PROPAGATION_OUTBOX_TYPES } from '../propagation-queue/propagation-queue.constants.js';
import { parseStrictDate } from '../paper/paper-date.util.js';
import { ClientTraysPropagationService } from './services/client-trays-propagation.service.js';

const STALE_DATA_MESSAGE =
  'Client Trays data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ClientTraysService {
  private readonly logger = new Logger(ClientTraysService.name);

  constructor(
    private readonly clienttraysRepository: ClientTraysRepository,

    private readonly clienttraysBuilder: ClientTraysBuilder,

    private readonly trayCalculationService: TrayCalculationService,

    private readonly workflowStateService: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,

    private readonly clienttraysValidationService: ClientTraysValidationService,

    private readonly propagationOutboxRepository: PropagationOutboxRepository,

    private readonly clientTraysPropagationService: ClientTraysPropagationService,

    private readonly prisma: PrismaService,
  ) {}

  /**
   * Calculates the sheet's ledger from live data: previous sheet's closing
   * (opening), order lines (taken) and stored returns. This is the single
   * source for both the grid and save validation.
   */
  private async loadSheetLedger(
    sheetId: number,
    t: TransactionClient,
    keepPositiveReturns = false,
  ) {
    const sheet = await this.clienttraysRepository.findSheetById(sheetId, t);

    if (!sheet) {
      throw new NotFoundException(CLIENT_TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const [
      sheetItems,
      trayRules,
      trayTypes,
      trayTransactions,
      openingBalances,
    ] = await Promise.all([
      this.clienttraysRepository.getSheetItems(sheet.id, t),
      this.clienttraysRepository.getProductTrayRules(t),
      this.clienttraysRepository.getAllTrayTypes(t),
      this.clienttraysRepository.getTrayTransactions(sheet.id, t),
      this.clienttraysRepository.getOpeningBalances(
        sheet.group_id,
        sheet.order_paper.sale_date,
        t,
      ),
    ]);

    // Ordered quantities until the morning delivered quantities are saved in
    // Orders; delivered quantities after that.
    const useOrderedQuantity =
      this.workflowStateService.resolveUseOrderedQuantity(
        sheet.order_paper.status,
        sheet.order_morning_entry_saved_at !== null,
      );

    const takenByKey = this.trayCalculationService.buildTakenMap(
      sheetItems,
      trayRules,
      useOrderedQuantity,
    );

    const returnedByKey = new Map<string, number | null>(
      trayTransactions.map((row) => [
        buildClientTrayKey({
          clientId: row.client_id,
          trayTypeId: row.tray_type_id,
          category: row.category,
        }),
        row.trays_returned,
      ]),
    );

    const ledgerLines = this.trayCalculationService.buildClientTrayLedger(
      openingBalances,
      takenByKey,
      returnedByKey,
      keepPositiveReturns,
    );

    // Names are needed for every client that can appear, whether or not they
    // are still active or still in this group (decisions 8 and 14).
    const clientIds = new Set<number>([
      ...sheetItems.map((item) => item.client_id),
      ...[...openingBalances.keys()].map(
        (key) => parseClientTrayKey(key).clientId,
      ),
      ...trayTransactions.map((row) => row.client_id),
    ]);

    const clients = await this.clienttraysRepository.getClientsByIds(
      [...clientIds],
      t,
    );

    return {
      sheet,
      trayTypes,
      clients,
      openingBalances,
      takenByKey,
      returnedByKey,
      ledgerLines,
    };
  }

  async getTraySheetService(sheetId: number, tx?: TransactionClient) {
    const run = async (t: TransactionClient) => {
      const ledger = await this.loadSheetLedger(sheetId, t, true);

      const workflow = this.workflowBuilder.buildTraysWorkflow(
        ledger.sheet.order_paper.status,
      );

      const trayBilling = this.clienttraysBuilder.buildTrayBilling({
        clients: ledger.clients,
        trayTypes: ledger.trayTypes,
        ledgerLines: ledger.ledgerLines,
      });

      return {
        sheet: ledger.sheet,
        workflow,
        ...trayBilling,
      };
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  private parseExpected(expected: string | null): Date | null {
    if (expected === null) return null;

    const date = new Date(expected);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.INVALID_EXPECTED_UPDATED_AT,
      );
    }

    return date;
  }

  async saveTrayEntriesService(
    sheetId: number,
    entries: SaveTrayReturnDto[],
    expectedUpdatedAt: string | null,
    // CT-15.5: true only from the admin reconciliation route, where inactive
    // tray types (and only those) can be changed.
    options: { reconcileInactive?: boolean } = {},
  ) {
    // Request-shape checks run before the transaction starts.
    this.clienttraysValidationService.validateNoDuplicateEntries(entries);
    const expected = this.parseExpected(expectedUpdatedAt);

    const clientTraysUpdatedAt = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const sheet = await this.clienttraysRepository.findSheetById(
            sheetId,
            tx,
          );

          if (!sheet) {
            throw new NotFoundException(
              CLIENT_TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND,
            );
          }

          const status = sheet.order_paper.status;

          if (!this.workflowStateService.canEditClientTrays(status)) {
            throw new BadRequestException(
              CLIENT_TRAY_ERROR_MESSAGES.TRAY_EDIT_NOT_ALLOWED,
            );
          }

          // Decisions 15-17: sheet-level token, always checked. A missing
          // token never reaches here (DTO) and a stale one is a 409.
          const touch =
            await this.clienttraysRepository.touchClientTraysIfTokenMatches(
              sheetId,
              expected,
              tx,
            );

          if (touch.count !== 1) {
            throw new ConflictException(STALE_DATA_MESSAGE);
          }

          // Everything is validated against the server's own numbers.
          const ledger = await this.loadSheetLedger(
            sheetId,
            tx,
            options.reconcileInactive === true,
          );

          this.clienttraysValidationService.validateReturnEntries(
            entries,
            ledger.ledgerLines,
            ledger.trayTypes,
            ledger.clients,
            options.reconcileInactive === true,
          );

          // Decision 3: a return that was not entered is zero. Rows already
          // in the ledger get their stored value (or 0); submitted entries
          // override.
          const returnedByKey = new Map<string, number | null>();

          for (const line of ledger.ledgerLines) {
            returnedByKey.set(buildClientTrayKey(line), line.returned ?? 0);
          }

          for (const entry of entries) {
            returnedByKey.set(buildClientTrayKey(entry), entry.returned);
          }

          const lines = this.trayCalculationService.buildClientTrayLedger(
            ledger.openingBalances,
            ledger.takenByKey,
            returnedByKey,
          );

          await this.clienttraysRepository.replaceTrayTransactions(
            sheetId,
            lines.map((line) =>
              this.trayCalculationService.toTransactionEntry(sheetId, line),
            ),
            tx,
          );

          // Decision 25: on a reopened paper, a changed closing balance must
          // reach later sheets. Orders already does this for delivered-
          // quantity corrections (DEP-002); this does the same for returns,
          // through the same outbox and queue.
          if (status === OrderPaperStatus.REOPENED) {
            // CT-15.1: a higher return lowers every later opening balance.
            // If a later sheet could no longer cover its own returns, this
            // save is refused instead of failing later in the background.
            await this.clientTraysPropagationService.assertNoForwardReturnConflicts(
              sheetId,
              tx,
            );

            await this.propagationOutboxRepository.enqueue(
              PROPAGATION_OUTBOX_TYPES.CLIENT_TRAYS_CASCADE_FROM_SHEET,
              sheet.order_paper_id,
              sheetId,
              tx,
            );
          }

          // Decision 16: the caller needs the new token to save again.
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
      message: CLIENT_TRAY_SUCCESS_MESSAGES.TRAY_RETURNS_SAVED,
      clientTraysUpdatedAt,
    };
  }

  /**
   * Decisions 26 and 27: administrative recalculation over a sale-date
   * window. Each paper in the window gets the existing forward propagation
   * job (full recalculation of its sheets, then opening/closing updates for
   * every later sheet of the same group), so it runs in the background in
   * resumable chunks. Progress and failures show up in the existing
   * propagation status endpoints.
   */
  async requestRangeRecalculationService(fromDate: string, toDate: string) {
    const from = parseStrictDate(fromDate);
    const to = parseStrictDate(toDate);

    if (!from || !to) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.INVALID_DATE_RANGE,
      );
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.DATE_RANGE_ORDER,
      );
    }

    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;

    if (days > MAX_RECALCULATION_RANGE_DAYS) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.DATE_RANGE_TOO_LONG(
          MAX_RECALCULATION_RANGE_DAYS,
        ),
      );
    }

    const papers = await this.clienttraysRepository.findPapersBySaleDateRange(
      from,
      to,
    );

    // CT-15.3: each queued job is one tracked operation. Its id is returned so
    // the run can be followed through the existing propagation status
    // (GET /papers/:id/propagation), including any failure and its reason.
    const operations = await this.prisma.$transaction(async (tx) => {
      const queued: { paperId: number; operationId: number }[] = [];

      for (const paper of papers) {
        const row = await this.propagationOutboxRepository.enqueue(
          PROPAGATION_OUTBOX_TYPES.CLIENT_TRAYS_FORWARD,
          paper.id,
          null,
          tx,
        );

        queued.push({ paperId: paper.id, operationId: row.id });
      }
      return queued;
    });

    this.logger.log(
      `Client trays recalculation queued for ${operations.length} paper(s), ${fromDate} to ${toDate}`,
    );

    return { papersQueued: operations.length, fromDate, toDate, operations };
  }
}
