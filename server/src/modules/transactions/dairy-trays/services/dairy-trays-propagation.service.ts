import { Injectable, NotFoundException } from '@nestjs/common';

import { DairyTraysRepository } from '../dairy-trays.repository.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import {
  DeliverySession,
  Prisma,
} from '../../../../generated/prisma/client.js';

@Injectable()
export class DairyTraysPropagationService {
  constructor(
    private readonly dairyTraysRepository: DairyTraysRepository,
    private readonly trayCalculationService: TrayCalculationService,
  ) {}

  async recalculateCurrentPaper(
    paperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.recalculatePaper(paperId, tx);
  }

  async propagateFromPaper(
    startPaperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const startPaper = await this.dairyTraysRepository.findPaperById(
      startPaperId,
      tx,
    );

    if (!startPaper) {
      throw new NotFoundException(`Order paper ${startPaperId} not found`);
    }

    // Only the paper whose own purchase entries actually changed gets a
    // full recompute of trays_taken.
    await this.recalculatePaper(startPaperId, tx);

    // Every paper after it only inherits the shifted opening balance —
    // their own trays_taken/trays_returned must never be touched by
    // someone else's correction or by tray-rule drift since they were
    // last finalized.
    let currentPaperId: number | null =
      (
        await this.dairyTraysRepository.getNextPaper(
          startPaper.id,
          startPaper.sale_date,
          tx,
        )
      )?.id ?? null;

    while (currentPaperId !== null) {
      await this.cascadeOpeningBalance(currentPaperId, tx);

      const paper = await this.dairyTraysRepository.findPaperById(
        currentPaperId,
        tx,
      );

      currentPaperId =
        (
          await this.dairyTraysRepository.getNextPaper(
            paper!.id,
            paper!.sale_date,
            tx,
          )
        )?.id ?? null;
    }
  }

  private async recalculatePaper(
    paperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const paper = await this.dairyTraysRepository.findPaperById(paperId, tx);

    if (!paper) {
      throw new NotFoundException(`Order paper ${paperId} not found`);
    }

    const dairyTrayPaper =
      await this.dairyTraysRepository.getOrCreateDairyTrayPaper(paperId, tx);

    /*
     * Purchase entries are the source of trays_taken.
     */
    const purchaseEntries = await this.dairyTraysRepository.getPurchaseEntries(
      paperId,
      tx,
    );

    const trayRules = await this.dairyTraysRepository.getProductTrayRules(tx);

    /*
     * Existing transactions contain the manually entered
     * trays_returned values.
     *
     * Propagation must preserve those values.
     */
    const existingTransactions =
      await this.dairyTraysRepository.getCurrentTrayTransactions(
        dairyTrayPaper.id,
        tx,
      );

    const existingTransactionMap = new Map<
      string,
      (typeof existingTransactions)[number]
    >();

    for (const transaction of existingTransactions) {
      existingTransactionMap.set(
        `${transaction.vehicle_id}_${transaction.delivery_session}_${transaction.tray_type_id}`,
        transaction,
      );
    }

    /*
     * Opening balance comes from the previous paper's
     * closing balance.
     */
    const previousPaper = await this.dairyTraysRepository.getPreviousPaper(
      paper.id,
      paper.sale_date,
      tx,
    );

    const previousClosingMap = new Map<string, number>();
    /*
     * Previous paper's NIGHT closing becomes the opening
     * balance for the current paper's NIGHT session.
     *
     * Key:
     *   vehicleId_trayTypeId
     */
    if (previousPaper) {
      const previousDairyTrayPaper =
        await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
          previousPaper.id,
          tx,
        );

      if (previousDairyTrayPaper) {
        const previousTransactions =
          await this.dairyTraysRepository.getPreviousTrayBalances(
            previousDairyTrayPaper.id,
            tx,
          );

        for (const transaction of previousTransactions) {
          const key = `${transaction.vehicle_id}_${transaction.delivery_session}_${transaction.tray_type_id}`;

          previousClosingMap.set(key, Number(transaction.closing_balance ?? 0));
        }
      }
    }

    /*
     * Calculate trays_taken from CURRENT purchase entries.
     *
     * Key:
     *   vehicleId_deliverySession_trayTypeId
     */
    const traysTakenMap = new Map<string, number>();

    for (const entry of purchaseEntries) {
      const trayTypeId = this.trayCalculationService.resolveFrozenTrayTypeId(
        entry,
        trayRules,
      );

      if (trayTypeId === null) {
        continue;
      }

      const key = `${entry.vehicle_id}_${entry.delivery_session}_${trayTypeId}`;

      const currentTaken = traysTakenMap.get(key) ?? 0;

      traysTakenMap.set(key, currentTaken + Number(entry.purchased_qty ?? 0));
    }

    /*
     * Existing transactions contain manually entered
     * trays_returned values.
     *
     * Key:
     *   vehicleId_deliverySession_trayTypeId
     */

    /*
     * Process all combinations that currently exist either
     * because of purchase data or because a transaction already
     * exists.
     */
    const keys = new Set<string>();

    for (const key of traysTakenMap.keys()) {
      keys.add(key);
    }

    for (const key of existingTransactionMap.keys()) {
      keys.add(key);
    }

    const transactions: Prisma.dairy_tray_transactionCreateManyInput[] = [];

    /*
     * ---------------------------------------------------------
     * 1. NIGHT
     * ---------------------------------------------------------
     */
    for (const key of keys) {
      const [vehicleIdString, deliverySessionString, trayTypeIdString] =
        key.split('_');

      if (deliverySessionString !== DeliverySession.NIGHT) {
        continue;
      }

      const vehicleId = Number(vehicleIdString);
      const trayTypeId = Number(trayTypeIdString);

      /*
       * Previous paper's NIGHT closing becomes current
       * paper's NIGHT opening.
       */
      const openingBalance = previousClosingMap.get(key) ?? 0;
      const traysTaken = traysTakenMap.get(key) ?? 0;

      const existingTransaction = existingTransactionMap.get(key);

      const traysReturned = Number(existingTransaction?.trays_returned ?? 0);

      const transaction = this.trayCalculationService.buildTransaction(
        openingBalance,
        traysTaken,
        traysReturned,
      );

      transactions.push({
        dairy_tray_paper_id: dairyTrayPaper.id,
        vehicle_id: vehicleId,
        tray_type_id: trayTypeId,
        delivery_session: DeliverySession.NIGHT,
        ...transaction,
      });
    }

    /*
     * ---------------------------------------------------------
     * 2. MORNING
     * ---------------------------------------------------------
     */
    for (const key of keys) {
      const [vehicleIdString, deliverySessionString, trayTypeIdString] =
        key.split('_');

      if (deliverySessionString !== DeliverySession.MORNING) {
        continue;
      }

      const vehicleId = Number(vehicleIdString);
      const trayTypeId = Number(trayTypeIdString);

      const openingBalance = previousClosingMap.get(key) ?? 0;
      const traysTaken = traysTakenMap.get(key) ?? 0;

      const existingTransaction = existingTransactionMap.get(key);

      const traysReturned = Number(existingTransaction?.trays_returned ?? 0);

      const transaction = this.trayCalculationService.buildTransaction(
        openingBalance,
        traysTaken,
        traysReturned,
      );

      transactions.push({
        dairy_tray_paper_id: dairyTrayPaper.id,
        vehicle_id: vehicleId,
        tray_type_id: trayTypeId,
        delivery_session: DeliverySession.MORNING,
        ...transaction,
      });
    }

    /*
     * Nothing to persist.
     */
    if (transactions.length === 0) {
      return;
    }

    /*
     * Replace the current paper's calculated transactions.
     *
     * trays_returned has already been copied from the existing
     * transactions, so manual return values are preserved.
     */
    await this.dairyTraysRepository.replaceTrayTransactions(
      dairyTrayPaper.id,
      transactions,
      tx,
    );
  }

  private async cascadeOpeningBalance(
    paperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const paper = await this.dairyTraysRepository.findPaperById(paperId, tx);
    if (!paper) {
      throw new NotFoundException(`Order paper ${paperId} not found`);
    }

    const dairyTrayPaper =
      await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
        paperId,
        tx,
      );

    if (!dairyTrayPaper) {
      return; // nothing recorded for this paper yet — nothing to cascade
    }

    const existingTransactions =
      await this.dairyTraysRepository.getCurrentTrayTransactions(
        dairyTrayPaper.id,
        tx,
      );

    if (existingTransactions.length === 0) {
      return;
    }

    const previousPaper = await this.dairyTraysRepository.getPreviousPaper(
      paper.id,
      paper.sale_date,
      tx,
    );

    const previousClosingMap = new Map<string, number>();

    if (previousPaper) {
      const previousDairyTrayPaper =
        await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
          previousPaper.id,
          tx,
        );

      if (previousDairyTrayPaper) {
        const previousTransactions =
          await this.dairyTraysRepository.getPreviousTrayBalances(
            previousDairyTrayPaper.id,
            tx,
          );

        for (const transaction of previousTransactions) {
          const key = `${transaction.vehicle_id}_${transaction.delivery_session}_${transaction.tray_type_id}`;
          previousClosingMap.set(key, Number(transaction.closing_balance ?? 0));
        }
      }
    }

    // trays_taken and trays_returned are NOT recomputed here — this paper's
    // own purchase entries haven't changed. Only the opening balance
    // inherited from the previous paper has, so only opening/closing shift.
    const transactions: Prisma.dairy_tray_transactionCreateManyInput[] =
      existingTransactions.map((transaction) => {
        const key = `${transaction.vehicle_id}_${transaction.delivery_session}_${transaction.tray_type_id}`;
        const openingBalance = previousClosingMap.get(key) ?? 0;
        const traysTaken = Number(transaction.trays_taken ?? 0);
        const traysReturned = Number(transaction.trays_returned ?? 0);

        return {
          dairy_tray_paper_id: dairyTrayPaper.id,
          vehicle_id: transaction.vehicle_id,
          tray_type_id: transaction.tray_type_id,
          delivery_session: transaction.delivery_session,
          opening_balance: openingBalance,
          trays_taken: traysTaken,
          trays_returned: traysReturned,
          closing_balance: this.trayCalculationService.calculateClosingBalance(
            openingBalance,
            traysTaken,
            traysReturned,
          ),
        };
      });

    if (transactions.length === 0) {
      return;
    }

    await this.dairyTraysRepository.replaceTrayTransactions(
      dairyTrayPaper.id,
      transactions,
      tx,
    );
  }
}
