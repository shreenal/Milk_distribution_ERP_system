import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { ClientTraysRepository } from '../client-trays.repository.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { TrayTransactionEntry } from '../../../../types/transaction.types.js';
import { WorkflowStateService } from '../../workflow/workflow-state.service.js';

@Injectable()
export class ClientTraysPropagationService {
  constructor(
    private readonly clientTraysRepository: ClientTraysRepository,
    private readonly trayCalculationService: TrayCalculationService,
    private readonly workflowState: WorkflowStateService,
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
    const startSheet = await this.clientTraysRepository.findSheetById(
      startSheetId,
      tx,
    );

    if (!startSheet) {
      throw new NotFoundException(`Order sheet ${startSheetId} not found`);
    }

    // Only the sheet whose own data actually changed gets a full recompute
    // of trays_taken (from its own order items + current tray rules).
    await this.recalculateSheet(startSheetId, tx);

    // Everything after it only inherits the shifted opening balance —
    // their own trays_taken/trays_returned must never be touched by
    // someone else's correction or by tray-rule drift since they were
    // last finalized.
    let currentSheetId: number | null =
      (
        await this.clientTraysRepository.getNextSheet(
          startSheet.group_id,
          startSheet.order_paper.sale_date,
          tx,
        )
      )?.id ?? null;

    while (currentSheetId !== null) {
      await this.cascadeOpeningBalance(currentSheetId, tx);

      const sheet = await this.clientTraysRepository.findSheetById(
        currentSheetId,
        tx,
      );

      currentSheetId =
        (
          await this.clientTraysRepository.getNextSheet(
            sheet!.group_id,
            sheet!.order_paper.sale_date,
            tx,
          )
        )?.id ?? null;
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
    const useOrderedQuantity = this.workflowState.resolveUseOrderedQuantity(
      sheet.order_paper.status,
      sheet.order_morning_entry_saved_at !== null,
    );

    const traysTakenMap = new Map<string, number>();

    for (const item of sheetItems) {
      const trayTypeId = this.trayCalculationService.resolveFrozenTrayTypeId(
        item,
        trayRules,
      );

      if (trayTypeId === null) {
        continue;
      }

      const traysTaken = this.trayCalculationService.calculateTraysTaken(
        Number(item.ordered_qty ?? 0),
        Number(item.delivered_qty ?? 0),
        useOrderedQuantity,
      );

      const key = `${item.client_id}_${trayTypeId}`;

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
      const traysReturned: number | null =
        existingTransaction?.trays_returned ?? null;

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

  private async cascadeOpeningBalance(
    sheetId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const sheet = await this.clientTraysRepository.findSheetById(sheetId, tx);
    if (!sheet) {
      throw new NotFoundException(`Order sheet ${sheetId} not found`);
    }

    const existingTransactions =
      await this.clientTraysRepository.getTrayTransactions(sheetId, tx);

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

    if (existingTransactions.length === 0 && openingBalanceMap.size === 0) {
      return;
    }

    const existingByKey = new Map(
      existingTransactions.map((t) => [`${t.client_id}_${t.tray_type_id}`, t]),
    );

    const keys = new Set<string>([
      ...existingByKey.keys(),
      ...openingBalanceMap.keys(),
    ]);

    const transactionEntries: TrayTransactionEntry[] = Array.from(keys).map(
      (key) => {
        const separatorIndex = key.indexOf('_');
        const clientId = Number(key.substring(0, separatorIndex));
        const trayTypeId = Number(key.substring(separatorIndex + 1));

        const existing = existingByKey.get(key);
        const openingBalance = openingBalanceMap.get(key) ?? 0;
        const traysTaken = Number(existing?.trays_taken ?? 0);
        const traysReturned: number | null = existing?.trays_returned ?? null;

        return {
          order_sheet_id: sheetId,
          client_id: clientId,
          tray_type_id: trayTypeId,
          opening_balance: openingBalance,
          trays_taken: traysTaken,
          trays_returned: traysReturned,
          closing_balance: this.trayCalculationService.calculateClosingBalance(
            openingBalance,
            traysTaken,
            traysReturned,
          ),
        };
      },
    );

    await this.clientTraysRepository.replaceTrayTransactions(
      transactionEntries,
      tx,
    );
  }
}
