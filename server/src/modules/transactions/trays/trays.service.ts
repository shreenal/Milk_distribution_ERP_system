import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TraysRepository } from './trays.repository.js';
import { TrayBillingBuilder } from './tray.billing-builder.js';
import { SaveTrayReturnDto } from './dto/save-trays-entries.dto.js';
import {
  TRAY_ERROR_MESSAGES,
  TRAY_SUCCESS_MESSAGES,
} from './trays.constants.js';
import { TrayTransactionEntry } from '../../../types/transaction.types.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';

@Injectable()
export class TraysService {
  private readonly logger = new Logger(TraysService.name);

  constructor(
    private readonly traysRepository: TraysRepository,

    private readonly trayBillingBuilder: TrayBillingBuilder,

    private readonly workflowStateService: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,
  ) {}
  async getTraySheetService(sheetId: number) {
    const sheet = await this.traysRepository.findSheetById(sheetId);

    if (!sheet) {
      throw new NotFoundException(TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const milkClients = await this.traysRepository.getClientsByGroupAndCategory(
      sheet.group_id,
      SupplyCategory.MILK,
    );

    const nonMilkClients =
      await this.traysRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        SupplyCategory.NON_MILK,
      );

    const sheetItems = await this.traysRepository.getSheetItems(sheet.id);

    const trayRules = await this.traysRepository.getProductTrayRules();

    const trayTypes = await this.traysRepository.getTrayTypes();

    const trayTransactions = await this.traysRepository.getTrayTransactions(
      sheet.id,
    );

    const openingBalanceMap = new Map<string, number>();

    const previousSheet = await this.traysRepository.getPreviousSheet(
      sheet.group_id,
      sheet.order_paper.sale_date,
    );

    if (previousSheet) {
      const balances = await this.traysRepository.getPreviousTrayBalances(
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

    const trayBilling = this.trayBillingBuilder.buildTrayBilling(
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
    const sheet = await this.traysRepository.findSheetById(sheetId);

    if (!sheet) {
      throw new NotFoundException(TRAY_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const status = await this.traysRepository.getPaperStatusBySheetId(sheetId);

    if (!this.workflowStateService.canEditTrays(status)) {
      throw new BadRequestException(TRAY_ERROR_MESSAGES.TRAY_EDIT_NOT_ALLOWED);
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
          TRAY_ERROR_MESSAGES.NEGATIVE_RETURNED_TRAYS,
        );
      }

      const field = `tray_${entry.trayTypeId}`;

      const trayRow = trayRows.find(
        (row) => row.clientId === entry.clientId && row[field] !== undefined,
      );

      if (!trayRow) {
        throw new BadRequestException(
          TRAY_ERROR_MESSAGES.TRAY_ROW_NOT_FOUND(entry.clientId),
        );
      }

      const opening = Number(trayRow[`tray_${entry.trayTypeId}_opening`] ?? 0);

      const trays = Number(trayRow[`tray_${entry.trayTypeId}`] ?? 0);

      const closing = opening + trays - returned;
      transactionEntries.push({
        order_sheet_id: sheetId,
        client_id: entry.clientId,
        tray_type_id: entry.trayTypeId,
        opening_balance: opening,
        trays_returned: returned,
        trays_taken: trays,
        closing_balance: closing,
      });
    }
    await this.traysRepository.replaceTrayTransactions(transactionEntries);

    return {
      success: true,
      message: TRAY_SUCCESS_MESSAGES.TRAY_RETURNS_SAVED,
    };
  }
}
