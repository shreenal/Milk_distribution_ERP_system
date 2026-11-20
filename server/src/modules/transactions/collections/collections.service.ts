import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { CollectionBuilder } from './collections.builder.js';
import {
  AmountColumn,
  CollectionsRepository,
} from './collections.repository.js';

import { SaveAdminCollectionsDto } from './dto/save-admin-collection.dto.js';
import { SaveNightCollectionsDto } from './dto/save-night-collection.dto.js';
import { SaveMorningCollectionsDto } from './dto/save-morning-collection.dto.js';

import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import {
  COLLECTION_ERROR_MESSAGES,
  COLLECTION_SUCCESS_MESSAGES,
  STALE_DATA_MESSAGE,
} from './collections.constants.js';

import {
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { CollectionsValidationService } from './services/collections-validation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { runTransactionSave } from '../../../common/transactions/transaction-save-pipeline.js';
import { staleDataConflict } from '../../../common/transactions/errors/stale-data.error.js';
import { optimisticConcurrency } from '../../../common/transactions/optimistic-concurrency.service.js';
import { runReadSnapshot } from '../../../common/transactions/read-snapshot.js';
import { diffByKey } from '../../../common/transactions/change-planning/diff-by-key.js';

const ADMIN_ROLE = 'ADMIN';

// The columns one phase owns. A phase never writes another phase's columns.
type PhaseValues = Partial<Record<AmountColumn, number>>;

type PhaseRow = { clientId: number; values: PhaseValues };

type SavePhaseParams = {
  sheetId: number;
  category: SupplyCategory;
  columns: AmountColumn[];
  rows: PhaseRow[];
  expectedUpdatedAt: string | null;
  role: string;
  canEdit: (status: OrderPaperStatus) => boolean;
  notAllowedMessage: (status: OrderPaperStatus) => string;
  successMessage: string;
};

@Injectable()
export class CollectionsService {
  constructor(
    private readonly collectionsRepository: CollectionsRepository,
    private readonly collectionBuilder: CollectionBuilder,
    private readonly collectionsValidationService: CollectionsValidationService,
    private readonly workflowState: WorkflowStateService,
    private readonly prisma: PrismaService,
  ) {}

  async getCollectionGrid(sheetId: number, role: string) {
    const includeAdminColumns = role === ADMIN_ROLE;

    return runReadSnapshot(this.prisma, async (tx) => {
      const sheet = await this.collectionsRepository.getOrderSheetById(
        sheetId,
        tx,
      );
      if (!sheet) {
        throw new NotFoundException(COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND);
      }

      const [milkClients, nonMilkClients, savedCollections] = await Promise.all(
        [
          this.collectionsRepository.getClientsForCollectionDisplay(
            sheetId,
            sheet.group_id,
            SupplyCategory.MILK,
            tx,
          ),
          this.collectionsRepository.getClientsForCollectionDisplay(
            sheetId,
            sheet.group_id,
            SupplyCategory.NON_MILK,
            tx,
          ),
          this.collectionsRepository.getCollectionEntries(sheetId, tx),
        ],
      );

      return this.collectionBuilder.buildCollectionSection(
        sheet,
        milkClients,
        nonMilkClients,
        savedCollections,
        includeAdminColumns,
      );
    });
  }

  // CD-2.1: blank / null / omitted amounts are 0 inside a submitted row.
  saveNightCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveNightCollectionsDto,
    role: string,
  ) {
    return this.savePhase({
      sheetId,
      category,
      columns: ['office_cash_collection'],
      rows: dto.entries.map((e) => ({
        clientId: e.clientId,
        values: { office_cash_collection: e.officeCashCollection ?? 0 },
      })),
      expectedUpdatedAt: dto.expectedUpdatedAt,
      role,
      canEdit: (s) => this.workflowState.canEditNightCollections(s),
      notAllowedMessage: () => COLLECTION_ERROR_MESSAGES.NIGHT_EDIT_NOT_ALLOWED,
      successMessage: COLLECTION_SUCCESS_MESSAGES.NIGHT_SAVED,
    });
  }

  saveMorningCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveMorningCollectionsDto,
    role: string,
  ) {
    return this.savePhase({
      sheetId,
      category,
      columns: ['cash_collection', 'cheque_collection'],
      rows: dto.entries.map((e) => ({
        clientId: e.clientId,
        values: {
          cash_collection: e.cashCollection ?? 0,
          cheque_collection: e.chequeCollection ?? 0,
        },
      })),
      expectedUpdatedAt: dto.expectedUpdatedAt,
      role,
      canEdit: (s) => this.workflowState.canEditMorningCollections(s),
      notAllowedMessage: (s) =>
        COLLECTION_ERROR_MESSAGES.MORNING_EDIT_NOT_ALLOWED(s),
      successMessage: COLLECTION_SUCCESS_MESSAGES.MORNING_SAVED,
    });
  }

  saveAdminCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveAdminCollectionsDto,
    role: string,
  ) {
    return this.savePhase({
      sheetId,
      category,
      columns: ['online_collection', 'bank_deposit'],
      rows: dto.entries.map((e) => ({
        clientId: e.clientId,
        values: {
          online_collection: e.onlineCollection ?? 0,
          bank_deposit: e.bankDeposit ?? 0,
        },
      })),
      expectedUpdatedAt: dto.expectedUpdatedAt,
      role,
      canEdit: (s) => this.workflowState.canAdminEditCollections(s),
      notAllowedMessage: () => COLLECTION_ERROR_MESSAGES.ADMIN_EDIT_NOT_ALLOWED,
      successMessage: COLLECTION_SUCCESS_MESSAGES.ADMIN_SAVED,
    });
  }

  /**
   * The one save flow shared by all three phases (CD-5):
   * sheet (404) -> status (400) -> token (409) -> client rules for NEW rows
   * (400) -> diff against stored rows -> advance token only if something
   * changes -> write -> return the new token and recalculated totals.
   */
  private async savePhase(p: SavePhaseParams) {
    this.collectionsValidationService.validateNoDuplicateClients(p.rows);

    const includeAdminColumns = p.role === ADMIN_ROLE;

    // Set by `plan`, read by `advanceToken` (CD-7.2).
    let routeCashChanged = false;

    const { token, totals, changed } = await runTransactionSave(this.prisma, {
      loadContext: async (tx) => {
        const sheet = await this.collectionsRepository.getOrderSheetById(
          p.sheetId,
          tx,
        );
        if (!sheet) {
          throw new NotFoundException(
            COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND,
          );
        }

        const status = sheet.order_paper.status;
        if (!p.canEdit(status)) {
          throw new BadRequestException(p.notAllowedMessage(status));
        }

        // CD-9.3: compared first, so a stale token is 409 even for a no-op.
        const expected = optimisticConcurrency.parseExpectedUpdatedAt(
          p.expectedUpdatedAt,
        ); // 400 on a malformed value (CD-9.1)
        if (
          !optimisticConcurrency.tokenMatches(
            sheet.collections_updated_at,
            expected,
          )
        ) {
          throw staleDataConflict(STALE_DATA_MESSAGE);
        }

        return { sheet, expected };
      },
      plan: async ({ sheet }, tx) => {
        const existing =
          await this.collectionsRepository.getCollectionsForClients(
            p.sheetId,
            p.category,
            p.rows.map((r) => r.clientId),
            tx,
          );

        // CD-6.2: a client who already has a row stays updatable even if
        // since deactivated or moved. Live rules apply only to new rows.
        // CD-2.2: an all-zero row for a client with no stored row creates
        // nothing, so it is ignored before any client rule is applied.
        const existingClientIds = new Set(existing.map((e) => e.client_id));
        const newClientRows = p.rows.filter(
          (r) =>
            !existingClientIds.has(r.clientId) &&
            Object.values(r.values).some((v) => v !== 0),
        );
        if (newClientRows.length > 0) {
          const validClients =
            await this.collectionsRepository.getClientsByGroupAndCategory(
              sheet.group_id,
              p.category,
              tx,
            );
          this.collectionsValidationService.validateClientsForCategory(
            newClientRows,
            validClients,
            p.category,
          );
        }

        // Only rows that would actually change anything are written
        // (CD-9.4). Clients not in the request are never touched.
        const { toInsert, toUpdate } = diffByKey(
          existing,
          p.rows,
          (e) => String(e.client_id),
          (r) => String(r.clientId),
          (e, r) =>
            (Object.entries(r.values) as [AmountColumn, number][]).some(
              ([column, value]) => Number(e[column]) !== value,
            ),
        );

        // CD-2.2: an all-zero row for a client with no stored row creates nothing.
        const changedRows = [
          ...toInsert.filter((r) =>
            Object.values(r.values).some((v) => v !== 0),
          ),
          ...toUpdate.map((u) => u.incomingRow),
        ];

        // CD-7.2: did a cash amount (a Cash Settlement input) change?
        const storedByClient = new Map(existing.map((e) => [e.client_id, e]));
        routeCashChanged =
          p.columns.includes('cash_collection') &&
          changedRows.some(
            (r) =>
              Number(storedByClient.get(r.clientId)?.cash_collection ?? 0) !==
              (r.values.cash_collection ?? 0),
          );

        return {
          changed: changedRows.length > 0,
          write: async () => {
            await this.collectionsRepository.upsertCollections(
              p.sheetId,
              p.category,
              p.columns,
              changedRows,
              tx,
            );
          },
        };
      },
      currentToken: ({ sheet }) => sheet.collections_updated_at,
      advanceToken: async ({ sheet, expected }, tx) => {
        const touched =
          await this.collectionsRepository.touchCollectionsIfTokenMatches(
            p.sheetId,
            expected,
            tx,
          );
        if (touched.count !== 1) {
          throw staleDataConflict(STALE_DATA_MESSAGE);
        }

        // CD-7.2: a changed cash amount changes route cash, so Cash
        // Settlement's token (order_paper.updated_at) moves too and its open
        // screen goes stale. Same transaction, so a failed save rolls it back.
        if (routeCashChanged) {
          const paperTouch =
            await this.collectionsRepository.touchOrderPaperIfTokenMatches(
              sheet.order_paper_id,
              sheet.order_paper.updated_at,
              tx,
            );
          if (paperTouch.count !== 1) {
            throw staleDataConflict(STALE_DATA_MESSAGE);
          }
        }

        return touched.touchedAt;
      },
      buildResponse: async ({ sheet }, result, tx) => {
        // CD-4.2: totals are rebuilt from stored data after the write.
        const [clients, saved] = await Promise.all([
          this.collectionsRepository.getClientsForCollectionDisplay(
            p.sheetId,
            sheet.group_id,
            p.category,
            tx,
          ),
          this.collectionsRepository.getCollectionEntries(p.sheetId, tx),
        ]);

        const totals = this.collectionBuilder.buildGrid(
          clients,
          saved.filter((c) => c.category === p.category),
          includeAdminColumns,
        ).totals;

        return {
          token: result.token ? new Date(result.token) : null,
          changed: result.changed,
          totals,
        };
      },
    });

    return {
      success: true,
      changed,
      message: p.successMessage,
      collectionsUpdatedAt: token?.toISOString() ?? null,
      totals,
    };
  }
}
