import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { ClientTraysRepository } from '../client-trays.repository.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { WorkflowStateService } from '../../workflow/workflow-state.service.js';
import { buildClientTrayKey } from '../../../../common/utils/client-tray-key.util.js';
import { ReturnConflict } from '../../../../common/calculators/tray-calculation.service.js';
import { CLIENT_TRAY_ERROR_MESSAGES } from '../client-trays.constants.js';

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

  // async propagateFromPaper(
  //   paperId: number,
  //   tx: Prisma.TransactionClient,
  // ): Promise<void> {
  //   const sheets = await this.clientTraysRepository.getSheetsByPaperId(
  //     paperId,
  //     tx,
  //   );

  //   for (const sheet of sheets) {
  //     await this.propagateFromSheet(sheet.id, tx);
  //   }
  // }

  // async propagateFromSheet(
  //   startSheetId: number,
  //   tx: Prisma.TransactionClient,
  // ): Promise<void> {
  //   const startSheet = await this.clientTraysRepository.findSheetById(
  //     startSheetId,
  //     tx,
  //   );

  //   if (!startSheet) {
  //     throw new NotFoundException(`Order sheet ${startSheetId} not found`);
  //   }

  //   // Only the sheet whose own data actually changed gets a full recompute
  //   // of trays_taken (from its own order items + current tray rules).
  //   await this.recalculateSheet(startSheetId, tx);

  //   // Everything after it only inherits the shifted opening balance —
  //   // their own trays_taken/trays_returned must never be touched by
  //   // someone else's correction or by tray-rule drift since they were
  //   // last finalized.
  //   let currentSheetId: number | null =
  //     (
  //       await this.clientTraysRepository.getNextSheet(
  //         startSheet.group_id,
  //         startSheet.order_paper.sale_date,
  //         tx,
  //       )
  //     )?.id ?? null;

  //   while (currentSheetId !== null) {
  //     await this.cascadeOpeningBalance(currentSheetId, tx);

  //     const sheet = await this.clientTraysRepository.findSheetById(
  //       currentSheetId,
  //       tx,
  //     );

  //     currentSheetId =
  //       (
  //         await this.clientTraysRepository.getNextSheet(
  //           sheet!.group_id,
  //           sheet!.order_paper.sale_date,
  //           tx,
  //         )
  //       )?.id ?? null;
  //   }
  // }

  async cascadeForwardChunk(
    startSheetId: number,
    resumeFromSheetId: number | null,
    chunkSize: number,
    tx: Prisma.TransactionClient,
  ): Promise<{ done: boolean; resumeFromSheetId?: number }> {
    const startSheet = await this.clientTraysRepository.findSheetById(
      startSheetId,
      tx,
    );

    if (!startSheet) {
      throw new NotFoundException(`Order sheet ${startSheetId} not found`);
    }

    let currentSheetId: number | null =
      resumeFromSheetId ??
      (
        await this.clientTraysRepository.getNextSheet(
          startSheet.group_id,
          startSheet.order_paper.sale_date,
          tx,
        )
      )?.id ??
      null;

    let steps = 0;

    while (currentSheetId !== null) {
      await this.cascadeOpeningBalance(currentSheetId, tx);
      steps++;

      const sheet = await this.clientTraysRepository.findSheetById(
        currentSheetId,
        tx,
      );
      const next = await this.clientTraysRepository.getNextSheet(
        sheet!.group_id,
        sheet!.order_paper.sale_date,
        tx,
      );

      if (steps >= chunkSize && next) {
        return { done: false, resumeFromSheetId: next.id };
      }

      currentSheetId = next?.id ?? null;
    }

    return { done: true };
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
    const openingBalances = await this.clientTraysRepository.getOpeningBalances(
      sheet.group_id,
      sheet.order_paper.sale_date,
      tx,
    );

    /*
     * Existing returned quantities are manual data.
     *
     * Propagation must preserve them and only recalculate:
     * - opening_balance
     * - trays_taken
     * - closing_balance
     */
    const returnedByKey = new Map<string, number | null>(
      existingTransactions.map((transaction) => [
        buildClientTrayKey({
          clientId: transaction.client_id,
          trayTypeId: transaction.tray_type_id,
          category: transaction.category,
        }),
        transaction.trays_returned,
      ]),
    );

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

    const takenByKey = this.trayCalculationService.buildTakenMap(
      sheetItems,
      trayRules,
      useOrderedQuantity,
    );

    // CT-15.1 / CT-15.2: if the corrected quantities cannot cover the
    // returns already recorded, stop here. Returns are not capped and rows
    // that still carry a return are not deleted.
    await this.assertNoReturnConflicts(
      openingBalances,
      takenByKey,
      returnedByKey,
      sheet.order_paper.sale_date,
      tx,
    );

    /*
     * Rows with neither an opening balance nor trays taken are not part of
     * the ledger, so they are deleted here, including when nothing is left.
     */
    const lines = this.trayCalculationService.buildClientTrayLedger(
      openingBalances,
      takenByKey,
      returnedByKey,
    );

    await this.clientTraysRepository.replaceTrayTransactions(
      sheetId,
      lines.map((line) =>
        this.trayCalculationService.toTransactionEntry(sheetId, line),
      ),
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

    const openingBalances = await this.clientTraysRepository.getOpeningBalances(
      sheet.group_id,
      sheet.order_paper.sale_date,
      tx,
    );

    if (existingTransactions.length === 0 && openingBalances.size === 0) {
      return;
    }

    // trays_taken and trays_returned are this sheet's own data and are kept
    // as stored; only the inherited opening balance (and so closing) moves.
    // CT-15.3: the sheet's paper status is deliberately not checked. A
    // correction cascade started from a reopened paper (or by an admin) must
    // reach later FINALIZED sheets too; it only refreshes derived balances,
    // and the outbox row that carries it is the record of the operation.
    const takenByKey = new Map<string, number>();
    const returnedByKey = new Map<string, number | null>();

    for (const transaction of existingTransactions) {
      const key = buildClientTrayKey({
        clientId: transaction.client_id,
        trayTypeId: transaction.tray_type_id,
        category: transaction.category,
      });
      takenByKey.set(key, Number(transaction.trays_taken ?? 0));
      returnedByKey.set(key, transaction.trays_returned);
    }

    await this.assertNoReturnConflicts(
      openingBalances,
      takenByKey,
      returnedByKey,
      sheet.order_paper.sale_date,
      tx,
    );

    const lines = this.trayCalculationService.buildClientTrayLedger(
      openingBalances,
      takenByKey,
      returnedByKey,
    );

    await this.clientTraysRepository.replaceTrayTransactions(
      sheetId,
      lines.map((line) =>
        this.trayCalculationService.toTransactionEntry(sheetId, line),
      ),
      tx,
    );
  }

  /**
   * CT-15.1: dry run of the forward cascade. Walks the later sheets of the
   * same group in memory, using the same rules as cascadeOpeningBalance, and
   * throws if any of them would be left with returns above its balance. The
   * caller runs it inside the same transaction as the change that started
   * the cascade, so a conflicting change is rolled back instead of failing
   * later in the background.
   *
   * The start sheet must already hold its new stored values.
   */
  async assertNoForwardReturnConflicts(
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

    let next = await this.clientTraysRepository.getNextSheet(
      startSheet.group_id,
      startSheet.order_paper.sale_date,
      tx,
    );

    if (!next) {
      return;
    }

    // Balances carried into the first later sheet. Updated as the walk goes.
    const carried = await this.clientTraysRepository.getOpeningBalances(
      startSheet.group_id,
      next.order_paper.sale_date,
      tx,
    );

    while (next) {
      const stored = await this.clientTraysRepository.getTrayTransactions(
        next.id,
        tx,
      );

      const takenByKey = new Map<string, number>();
      const returnedByKey = new Map<string, number | null>();

      for (const transaction of stored) {
        const key = buildClientTrayKey({
          clientId: transaction.client_id,
          trayTypeId: transaction.tray_type_id,
          category: transaction.category,
        });
        takenByKey.set(key, Number(transaction.trays_taken ?? 0));
        returnedByKey.set(key, transaction.trays_returned);
      }

      await this.assertNoReturnConflicts(
        carried,
        takenByKey,
        returnedByKey,
        next.order_paper.sale_date,
        tx,
      );

      const lines = this.trayCalculationService.buildClientTrayLedger(
        carried,
        takenByKey,
        returnedByKey,
      );

      for (const line of lines) {
        const key = buildClientTrayKey(line);

        if (line.closing !== 0) {
          carried.set(key, line.closing);
        } else {
          carried.delete(key);
        }
      }

      next = await this.clientTraysRepository.getNextSheet(
        next.group_id,
        next.order_paper.sale_date,
        tx,
      );
    }
  }

  private async assertNoReturnConflicts(
    opening: Map<string, number>,
    taken: Map<string, number>,
    returned: Map<string, number | null>,
    saleDate: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const conflicts: ReturnConflict[] =
      this.trayCalculationService.findReturnConflicts(opening, taken, returned);

    if (conflicts.length === 0) {
      return;
    }

    const [clients, trayTypes] = await Promise.all([
      this.clientTraysRepository.getClientsByIds(
        [...new Set(conflicts.map((c) => c.clientId))],
        tx,
      ),
      this.clientTraysRepository.getAllTrayTypes(tx),
    ]);

    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const trayLabel = new Map(
      trayTypes.map((t) => [t.id, `${t.master_brand.name} ${t.color} tray`]),
    );
    const date = saleDate.toISOString().slice(0, 10);

    throw new ConflictException({
      message: CLIENT_TRAY_ERROR_MESSAGES.RETURN_DISCREPANCY,
      details: conflicts.map((c) =>
        CLIENT_TRAY_ERROR_MESSAGES.RETURN_DISCREPANCY_DETAIL(
          date,
          clientName.get(c.clientId) ?? `#${c.clientId}`,
          trayLabel.get(c.trayTypeId) ?? `tray type ${c.trayTypeId}`,
          c.returned,
          c.available,
        ),
      ),
    });
  }

  async propagateFromPaperChunk(
    paperId: number,
    resumeFromSheetId: number | null,
    chunkSize: number,
    tx: Prisma.TransactionClient,
  ): Promise<{ done: boolean; resumeFromSheetId?: number }> {
    const startingSheetRefs =
      await this.clientTraysRepository.getSheetsByPaperId(paperId, tx);

    if (startingSheetRefs.length === 0) {
      return { done: true };
    }

    const startingSheets: NonNullable<
      Awaited<ReturnType<typeof this.clientTraysRepository.findSheetById>>
    >[] = [];

    for (const ref of startingSheetRefs) {
      const sheet = await this.clientTraysRepository.findSheetById(ref.id, tx);
      if (sheet) startingSheets.push(sheet);
    }

    let startIndex = 0;
    let cursorSheetId: number | null = null;

    if (resumeFromSheetId !== null) {
      const resumeSheet = await this.clientTraysRepository.findSheetById(
        resumeFromSheetId,
        tx,
      );
      if (resumeSheet) {
        const idx = startingSheets.findIndex(
          (s) => s.group_id === resumeSheet.group_id,
        );
        if (idx >= 0) {
          startIndex = idx;
          cursorSheetId = resumeFromSheetId;
        }
      }
    }

    let steps = 0;

    for (let i = startIndex; i < startingSheets.length; i++) {
      const startSheet = startingSheets[i];
      let currentSheetId: number | null;

      if (cursorSheetId !== null) {
        // Resuming mid-chain: the starting sheet itself was already
        // recalculated in a previous chunk run.
        currentSheetId = cursorSheetId;
        cursorSheetId = null;
      } else {
        await this.recalculateSheet(startSheet.id, tx);
        steps++;

        // if (steps >= chunkSize) {
        //   const next = await this.clientTraysRepository.getNextSheet(
        //     startSheet.group_id,
        //     startSheet.order_paper.sale_date,
        //     tx,
        //   );
        //   return { done: false, resumeFromSheetId: next?.id };
        // }

        const next = await this.clientTraysRepository.getNextSheet(
          startSheet.group_id,
          startSheet.order_paper.sale_date,
          tx,
        );
        if (steps >= chunkSize && next) {
          return { done: false, resumeFromSheetId: next.id };
        }
        currentSheetId = next?.id ?? null;
      }

      while (currentSheetId !== null) {
        await this.cascadeOpeningBalance(currentSheetId, tx);
        steps++;

        const sheet = await this.clientTraysRepository.findSheetById(
          currentSheetId,
          tx,
        );
        const next = await this.clientTraysRepository.getNextSheet(
          sheet!.group_id,
          sheet!.order_paper.sale_date,
          tx,
        );

        if (steps >= chunkSize && next) {
          return { done: false, resumeFromSheetId: next.id };
        }

        currentSheetId = next?.id ?? null;
      }
    }

    return { done: true };
  }
}
