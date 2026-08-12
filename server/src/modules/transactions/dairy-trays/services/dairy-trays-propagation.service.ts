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

  async recalculateCurrentPaper(paperId: number): Promise<void> {
    await this.recalculatePaper(paperId);
  }

  async propagateFromPaper(startPaperId: number): Promise<void> {
    let currentPaperId: number | null = startPaperId;

    while (currentPaperId !== null) {
      const paper =
        await this.dairyTraysRepository.findPaperById(currentPaperId);

      if (!paper) {
        throw new NotFoundException(`Order paper ${currentPaperId} not found`);
      }

      await this.recalculatePaper(currentPaperId);

      const nextPaper = await this.dairyTraysRepository.getNextPaper(
        paper.id,
        paper.sale_date,
      );

      currentPaperId = nextPaper?.id ?? null;
    }
  }

  private async recalculatePaper(paperId: number): Promise<void> {
    const paper = await this.dairyTraysRepository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException(`Order paper ${paperId} not found`);
    }

    const dairyTrayPaper =
      await this.dairyTraysRepository.getOrCreateDairyTrayPaper(paperId);

    /*
     * Purchase entries are the source of trays_taken.
     */
    const purchaseEntries =
      await this.dairyTraysRepository.getPurchaseEntries(paperId);

    const trayRules = await this.dairyTraysRepository.getProductTrayRules();

    /*
     * Existing transactions contain the manually entered
     * trays_returned values.
     *
     * Propagation must preserve those values.
     */
    const existingTransactions =
      await this.dairyTraysRepository.getCurrentTrayTransactions(
        dairyTrayPaper.id,
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
        );

      if (previousDairyTrayPaper) {
        const previousTransactions =
          await this.dairyTraysRepository.getPreviousTrayBalances(
            previousDairyTrayPaper.id,
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
      const trayRule = this.trayCalculationService.resolveTrayRule(
        entry.master_product,
        trayRules,
      );

      if (!trayRule) {
        continue;
      }

      const key = `${entry.vehicle_id}_${entry.delivery_session}_${trayRule.tray_type_id}`;

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

      const inventoryKey = `${vehicleId}_${trayTypeId}`;

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
    );
  }
}
