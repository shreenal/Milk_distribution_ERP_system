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

@Injectable()
export class ClientTraysService {
  private readonly logger = new Logger(ClientTraysService.name);

  constructor(
    private readonly clienttraysRepository: ClientTraysRepository,

    private readonly clienttraysBuilder: ClientTraysBuilder,

    private readonly trayCalculationService: TrayCalculationService,

    private readonly workflowStateService: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,
  ) {}
  async getTraySheetService(sheetId: number) {
    const sheet = await this.clienttraysRepository.findSheetById(sheetId);

    if (!sheet) {
      throw new NotFoundException(CLIENT_TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const milkClients =
      await this.clienttraysRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        SupplyCategory.MILK,
      );

    const nonMilkClients =
      await this.clienttraysRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        SupplyCategory.NON_MILK,
      );

    const sheetItems = await this.clienttraysRepository.getSheetItems(sheet.id);

    const trayRules = await this.clienttraysRepository.getProductTrayRules();

    const trayTypes = await this.clienttraysRepository.getTrayTypes();

    const trayTransactions =
      await this.clienttraysRepository.getTrayTransactions(sheet.id);

    const openingBalanceMap = new Map<string, number>();

    const previousSheet = await this.clienttraysRepository.getPreviousSheet(
      sheet.group_id,
      sheet.order_paper.sale_date,
    );

    if (previousSheet) {
      const balances = await this.clienttraysRepository.getPreviousTrayBalances(
        previousSheet.id,
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
    );

    return {
      sheet,
      workflow,
      ...trayBilling,
    };
  }

  async saveTrayEntriesService(
    sheetId: number,
    entries: SaveTrayReturnDto[], // ← Updated type
  ) {
    const sheet = await this.clienttraysRepository.findSheetById(sheetId);

    if (!sheet) {
      throw new NotFoundException(CLIENT_TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const status =
      await this.clienttraysRepository.getPaperStatusBySheetId(sheetId);

    if (!this.workflowStateService.canEditClientTrays(status)) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.TRAY_EDIT_NOT_ALLOWED,
      );
    }

    const traySheet = await this.getTraySheetService(sheetId);
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
        (row) => row.clientId === entry.clientId && row[field] !== undefined,
      );

      if (!trayRow) {
        throw new BadRequestException(
          CLIENT_TRAY_ERROR_MESSAGES.TRAY_ROW_NOT_FOUND(entry.clientId),
        );
      }

      const opening = Number(trayRow[`tray_${entry.trayTypeId}_opening`] ?? 0);

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
    );

    return {
      success: true,
      message: CLIENT_TRAY_SUCCESS_MESSAGES.TRAY_RETURNS_SAVED,
    };
  }
}
