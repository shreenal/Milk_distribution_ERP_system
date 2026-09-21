import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ClientTraysRepository } from './client-trays.repository.js';
import { ClientTraysBuilder } from './client-trays.builder.js';
import { SaveTrayReturnDto } from './dto/save-trays-entries.dto.js';
import {
  CLIENT_TRAY_ERROR_MESSAGES,
  CLIENT_TRAY_SUCCESS_MESSAGES,
} from './client-trays.constants.js';
import { TrayTransactionEntry } from '../../../types/transaction.types.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';
import { ClientTraysPropagationService } from './services/client-trays-propagation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TransactionClient } from '../../../types/transaction.types.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';

@Injectable()
export class ClientTraysService {
  private readonly logger = new Logger(ClientTraysService.name);

  constructor(
    private readonly clienttraysRepository: ClientTraysRepository,

    private readonly clienttraysBuilder: ClientTraysBuilder,

    private readonly trayCalculationService: TrayCalculationService,

    private readonly workflowStateService: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,

    private readonly clientTraysPropagationService: ClientTraysPropagationService,

    private readonly prisma: PrismaService,
  ) {}
  async getTraySheetService(sheetId: number, tx?: TransactionClient) {
    const run = async (t: TransactionClient) => {
      const sheet = await this.clienttraysRepository.findSheetById(sheetId, t);

      if (!sheet) {
        throw new NotFoundException(CLIENT_TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND);
      }

      const [
        milkClients,
        nonMilkClients,
        sheetItems,
        trayRules,
        trayTypes,
        trayTransactions,
      ] = await Promise.all([
        this.clienttraysRepository.getClientsByGroupAndCategory(
          sheet.group_id,
          SupplyCategory.MILK,
          t,
        ),
        this.clienttraysRepository.getClientsByGroupAndCategory(
          sheet.group_id,
          SupplyCategory.NON_MILK,
          t,
        ),
        this.clienttraysRepository.getSheetItems(sheet.id, t),
        this.clienttraysRepository.getProductTrayRules(t),
        this.clienttraysRepository.getTrayTypes(t),
        this.clienttraysRepository.getTrayTransactions(sheet.id, t),
      ]);

      const openingBalanceMap = new Map<string, number>();

      const previousSheet = await this.clienttraysRepository.getPreviousSheet(
        sheet.group_id,
        sheet.order_paper.sale_date,
        t,
      );

      if (previousSheet) {
        const balances =
          await this.clienttraysRepository.getPreviousTrayBalances(
            previousSheet.id,
            t,
          );

        for (const balance of balances) {
          openingBalanceMap.set(
            `${balance.client_id}_${balance.tray_type_id}`,
            Number(balance.closing_balance ?? 0),
          );
        }
      }

      const workflow = this.workflowBuilder.buildTraysWorkflow(
        sheet.order_paper.status,
      );

      const morningEntrySaved = sheet.order_morning_entry_saved_at !== null;

      const trayBilling = this.clienttraysBuilder.buildTrayBilling(
        {
          milkClients,
          nonMilkClients,
          trayTypes,
          sheetItems,
          trayRules,
          trayTransactions,
          openingBalanceMap,
        },
        sheet.order_paper.status,
        morningEntrySaved,
      );

      return {
        sheet,
        workflow,
        ...trayBilling,
      };
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async saveTrayEntriesService(sheetId: number, entries: SaveTrayReturnDto[]) {
    await withSerializableRetry(() =>
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

          const traySheet = await this.getTraySheetService(sheetId, tx);

          const trayRows = [
            ...traySheet.milkTrayGrid.rows,
            ...traySheet.nonMilkTrayGrid.rows,
          ];

          const transactionEntries: TrayTransactionEntry[] = [];

          for (const entry of entries) {
            const returned = Number(entry.returned ?? 0);

            if (returned < 0) {
              throw new BadRequestException(
                CLIENT_TRAY_ERROR_MESSAGES.NEGATIVE_RETURNED_TRAYS,
              );
            }

            const field = `tray_${entry.trayTypeId}`;

            const trayRow = trayRows.find(
              (row) =>
                row.clientId === entry.clientId && row[field] !== undefined,
            );

            if (!trayRow) {
              throw new BadRequestException(
                CLIENT_TRAY_ERROR_MESSAGES.TRAY_ROW_NOT_FOUND(entry.clientId),
              );
            }

            const opening = Number(
              trayRow[`tray_${entry.trayTypeId}_opening`] ?? 0,
            );

            const trays = Number(trayRow[`tray_${entry.trayTypeId}`] ?? 0);

            const transaction = this.trayCalculationService.buildTransaction(
              opening,
              trays,
              returned,
            );

            transactionEntries.push({
              order_sheet_id: sheetId,
              client_id: entry.clientId,
              tray_type_id: entry.trayTypeId,
              ...transaction,
            });
          }

          await this.clienttraysRepository.replaceTrayTransactions(
            transactionEntries,
            tx,
          );

          // Intentional exception: this is an internal Client Trays recalculation
          // triggered by Client Trays' own save, not a cross-module dependency —
          // not routed through DependencyOrchestratorService, and not in the
          // business dependency register for that reason.
          await this.clientTraysPropagationService.recalculateFromSheet(
            sheetId,
            tx,
          );

          await this.clienttraysRepository.markClientTrayMorningEntrySaved(
            sheetId,
            tx,
          );

          return {
            success: true,
            message: CLIENT_TRAY_SUCCESS_MESSAGES.TRAY_RETURNS_SAVED,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }
}
