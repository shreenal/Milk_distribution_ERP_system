import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderPaperStatus,
  Prisma,
} from '../../../../generated/prisma/client.js';

import { ClientTraysRepository } from '../client-trays.repository.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { TrayTransactionEntry } from '../../../../types/transaction.types.js';

@Injectable()
export class ClientTraysPropagationService {
  constructor(
    private readonly clientTraysRepository: ClientTraysRepository,
    private readonly trayCalculationService: TrayCalculationService,
  ) {}

  async recalculateFromSheet(
    sheetId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.recalculateSheet(sheetId, tx);
  }

  async propagateFromPaper(
    paperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const sheets = await this.clientTraysRepository.getSheetsByPaperId(
      paperId,
      tx,
    );

    for (const sheet of sheets) {
      await this.propagateFromSheet(sheet.id, tx);
    }
  }

  async propagateFromSheet(
    startSheetId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    let currentSheetId: number | null = startSheetId;

    while (currentSheetId !== null) {
      const sheet = await this.clientTraysRepository.findSheetById(
        currentSheetId,
        tx,
      );

      if (!sheet) {
        throw new NotFoundException(`Order sheet ${currentSheetId} not found`);
      }

      await this.recalculateSheet(currentSheetId, tx);

      const nextSheet = await this.clientTraysRepository.getNextSheet(
        sheet.group_id,
        sheet.order_paper.sale_date,
        tx,
      );

      currentSheetId = nextSheet?.id ?? null;
    }
  }

  private async recalculateSheet(
    sheetId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const sheet = await this.clientTraysRepository.findSheetById(sheetId, tx);

    if (!sheet) {
      throw new NotFoundException(`Order sheet ${sheetId} not found`);
    }

    const sheetItems = await this.clientTraysRepository.getSheetItems(
      sheetId,
      tx,
    );

    const trayRules = await this.clientTraysRepository.getProductTrayRules(tx);

    const existingTransactions =
      await this.clientTraysRepository.getTrayTransactions(sheetId, tx);

    /*
     * Opening balance comes from the previous sheet's
     * closing balance.
     */
    const previousSheet = await this.clientTraysRepository.getPreviousSheet(
      sheet.group_id,
      sheet.order_paper.sale_date,
      tx,
    );

    const openingBalanceMap = new Map<string, number>();

    if (previousSheet) {
      const previousBalances =
        await this.clientTraysRepository.getPreviousTrayBalances(
          previousSheet.id,
          tx,
        );

      for (const balance of previousBalances) {
        openingBalanceMap.set(
          `${balance.client_id}_${balance.tray_type_id}`,
          Number(balance.closing_balance ?? 0),
        );
      }
    }

    /*
     * Existing returned quantities are manual data.
     *
     * Propagation must preserve them and only recalculate:
     * - opening_balance
     * - trays_taken
     * - closing_balance
     */
    const existingTransactionMap = new Map<
      string,
      (typeof existingTransactions)[number]
    >();

    for (const transaction of existingTransactions) {
      existingTransactionMap.set(
        `${transaction.client_id}_${transaction.tray_type_id}`,
        transaction,
      );
    }

    /*
     * Calculate trays taken from order quantities / delivered
     * quantities.
     *
     * DRAFT:
     *   ordered_qty
     *
     * Everything after DRAFT:
     *   delivered_qty
     */
    const useOrderedQuantity =
      sheet.order_paper.status === OrderPaperStatus.DRAFT;

    const traysTakenMap = new Map<string, number>();

    for (const item of sheetItems) {
      const trayRule = this.trayCalculationService.resolveTrayRule(
        item.master_product,
        trayRules,
      );

      if (!trayRule) {
        continue;
      }

      const traysTaken = this.trayCalculationService.calculateTraysTaken(
        Number(item.ordered_qty ?? 0),
        Number(item.delivered_qty ?? 0),
        useOrderedQuantity,
      );

      const key = `${item.client_id}_${trayRule.tray_type_id}`;

      traysTakenMap.set(key, (traysTakenMap.get(key) ?? 0) + traysTaken);
    }

    /*
     * We need to recalculate:
     *
     * 1. Every tray combination generated from current orders.
     * 2. Existing tray transactions, because they may contain
     *    manually entered returned quantities even when the
     *    current order quantity is now zero.
     */
    const keys = new Set<string>();

    for (const key of traysTakenMap.keys()) {
      keys.add(key);
    }

    for (const key of existingTransactionMap.keys()) {
      keys.add(key);
    }

    const transactionEntries: TrayTransactionEntry[] = [];

    for (const key of keys) {
      const separatorIndex = key.indexOf('_');

      const clientId = Number(key.substring(0, separatorIndex));

      const trayTypeId = Number(key.substring(separatorIndex + 1));

      const openingBalance = openingBalanceMap.get(key) ?? 0;

      const traysTaken = traysTakenMap.get(key) ?? 0;

      const existingTransaction = existingTransactionMap.get(key);

      /*
       * IMPORTANT:
       *
       * trays_returned is manual data.
       * Never recalculate it from orders.
       */
      const traysReturned = Number(existingTransaction?.trays_returned ?? 0);

      const closingBalance =
        this.trayCalculationService.calculateClosingBalance(
          openingBalance,
          traysTaken,
          traysReturned,
        );

      transactionEntries.push({
        order_sheet_id: sheetId,
        client_id: clientId,
        tray_type_id: trayTypeId,
        opening_balance: openingBalance,
        trays_taken: traysTaken,
        trays_returned: traysReturned,
        closing_balance: closingBalance,
      });
    }

    if (transactionEntries.length === 0) {
      return;
    }

    await this.clientTraysRepository.replaceTrayTransactions(
      transactionEntries,
      tx,
    );
  }
}
