import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DairyTraysRepository } from '../dairy-trays.repository.js';
import { DairyTraysLedgerService } from './dairy-trays-ledger.service.js';
import { WorkflowStateService } from '../../workflow/workflow-state.service.js';
import {
  OrderPaperStatus,
  Prisma,
} from '../../../../generated/prisma/client.js';
import { DAIRY_TRAYS_ERROR_MESSAGES as MSG } from '../dairy-trays.constants.js';
import { buildDairyTrayKey } from '../dairy-trays.util.js';

type PaperRef = { id: number; sale_date: Date };

@Injectable()
export class DairyTraysPropagationService {
  constructor(
    private readonly dairyTraysRepository: DairyTraysRepository,
    private readonly ledgerService: DairyTraysLedgerService,
    private readonly workflowState: WorkflowStateService,
  ) {}

  /**
   * DT-10.1: called inside the Purchase save transaction. Gated by paper
   * status (DT-2.4). A return conflict throws 409 and rolls the purchase save
   * back (DT-6.5). On a REOPENED paper the check also covers every later
   * paper (DT-10.2).
   */
  async recalculateCurrentPaper(
    paperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const paper = await this.dairyTraysRepository.findPaperById(paperId, tx);

    if (!paper) {
      throw new NotFoundException(`Order paper ${paperId} not found`);
    }

    if (!this.workflowState.canEditDairyTrays(paper.status)) {
      throw new BadRequestException(MSG.EDIT_NOT_ALLOWED);
    }

    await this.recalculatePaper(paper, tx);

    if (paper.status === OrderPaperStatus.REOPENED) {
      await this.assertNoForwardReturnConflicts(paper.id, tx);
    }
  }

  /**
   * Full recalculation of one paper: opening from the latest earlier closing
   * (DT-6.3), taken from purchases (DT-6.4), returns preserved exactly as
   * stored (DT-4.6). Zero-activity rows are removed, never one holding a
   * positive return (DT-7.2).
   */
  private async recalculatePaper(
    paper: PaperRef,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const dairyTrayPaper =
      await this.dairyTraysRepository.getOrCreateDairyTrayPaper(paper.id, tx);

    const inputs = await this.ledgerService.loadInputs(
      paper,
      dairyTrayPaper.id,
      tx,
    );

    await this.ledgerService.assertNoReturnConflicts(
      inputs.openingBalances,
      inputs.takenByKey,
      inputs.returnedByKey,
      paper.sale_date,
      tx,
    );

    const lines = this.ledgerService.buildLedger(
      inputs.openingBalances,
      inputs.takenByKey,
      inputs.returnedByKey,
    );

    // DT-9.6: the token moves only when stored dairy tray data changes. A
    // Purchase save that changes Taken therefore advances it, which is correct
    // because the calculated balances changed under anyone with the grid open.
    if (!this.ledgerService.hasLedgerChanged(inputs.stored, lines)) {
      return;
    }

    await this.dairyTraysRepository.replaceTrayTransactions(
      dairyTrayPaper.id,
      lines.map((line) =>
        this.ledgerService.toTransactionInput(dairyTrayPaper.id, line),
      ),
      tx,
    );

    await this.dairyTraysRepository.advanceDairyTrayPaperToken(
      dairyTrayPaper.id,
      tx,
    );
  }

  /**
   * DT-10.3 / DT-10.4: refreshes ONE later paper. Only opening and closing
   * move; its taken and returned are kept exactly as stored. A non-zero
   * carried balance with no row gets a carry-forward row (returned = 0).
   * The paper's status is deliberately not checked (DT-11.5).
   */
  private async cascadeOpeningBalance(
    paperId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const paper = await this.dairyTraysRepository.findPaperById(paperId, tx);

    if (!paper) {
      throw new NotFoundException(`Order paper ${paperId} not found`);
    }

    const header =
      await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
        paperId,
        tx,
      );

    const existing = header
      ? await this.dairyTraysRepository.getCurrentTrayTransactions(
          header.id,
          tx,
        )
      : [];

    const openingBalances = await this.dairyTraysRepository.getOpeningBalances(
      paper.sale_date,
      tx,
    );

    if (existing.length === 0 && openingBalances.size === 0) {
      return;
    }

    const dairyTrayPaperId =
      header?.id ??
      (await this.dairyTraysRepository.getOrCreateDairyTrayPaper(paperId, tx))
        .id;

    const { takenByKey, returnedByKey } = this.mapStoredRows(existing);

    await this.ledgerService.assertNoReturnConflicts(
      openingBalances,
      takenByKey,
      returnedByKey,
      paper.sale_date,
      tx,
    );

    const lines = this.ledgerService.buildLedger(
      openingBalances,
      takenByKey,
      returnedByKey,
    );

    // DT-9.6: an unchanged later paper is left alone and its token is not moved.
    if (!this.ledgerService.hasLedgerChanged(existing, lines)) {
      return;
    }

    await this.dairyTraysRepository.replaceTrayTransactions(
      dairyTrayPaperId,
      lines.map((line) =>
        this.ledgerService.toTransactionInput(dairyTrayPaperId, line),
      ),
      tx,
    );

    await this.dairyTraysRepository.advanceDairyTrayPaperToken(
      dairyTrayPaperId,
      tx,
    );
  }

  /**
   * DT-10.2 / DT-6.5: dry run of the forward cascade. Walks the later papers
   * in memory with the same rules as cascadeOpeningBalance and throws 409 if
   * any of them would be left with returns above its balance. The start paper
   * must already hold its new stored values. Callers run it inside the same
   * transaction as the change, so a conflicting change is rolled back instead
   * of failing later in the background.
   */
  async assertNoForwardReturnConflicts(
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

    let next = await this.dairyTraysRepository.getNextPaper(
      startPaper.id,
      startPaper.sale_date,
      tx,
    );

    if (!next) {
      return;
    }

    // Balances carried into the first later paper. Updated as the walk goes.
    const carried = await this.dairyTraysRepository.getOpeningBalances(
      next.sale_date,
      tx,
    );

    while (next) {
      const header =
        await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
          next.id,
          tx,
        );
      const stored = header
        ? await this.dairyTraysRepository.getCurrentTrayTransactions(
            header.id,
            tx,
          )
        : [];

      const { takenByKey, returnedByKey } = this.mapStoredRows(stored);

      await this.ledgerService.assertNoReturnConflicts(
        carried,
        takenByKey,
        returnedByKey,
        next.sale_date,
        tx,
      );

      const lines = this.ledgerService.buildLedger(
        carried,
        takenByKey,
        returnedByKey,
      );

      for (const line of lines) {
        const key = buildDairyTrayKey(line);

        if (line.closing !== 0) {
          carried.set(key, line.closing);
        } else {
          carried.delete(key);
        }
      }

      next = await this.dairyTraysRepository.getNextPaper(
        next.id,
        next.sale_date,
        tx,
      );
    }
  }

  /**
   * DT-10.5: the forward job. The start paper gets a full recalculation, then
   * every later paper (next by sale date) gets cascadeOpeningBalance. Work is
   * chunked; a full chunk returns the paper to resume from.
   */
  async propagateFromPaperChunk(
    startPaperId: number,
    resumeFromPaperId: number | null,
    chunkSize: number,
    tx: Prisma.TransactionClient,
  ): Promise<{ done: boolean; resumeFromPaperId?: number }> {
    let steps = 0;
    let cursorPaperId = resumeFromPaperId;

    if (cursorPaperId === null) {
      const startPaper = await this.dairyTraysRepository.findPaperById(
        startPaperId,
        tx,
      );

      if (!startPaper) {
        throw new NotFoundException(`Order paper ${startPaperId} not found`);
      }

      await this.recalculatePaper(startPaper, tx);
      steps++;

      const next = await this.dairyTraysRepository.getNextPaper(
        startPaper.id,
        startPaper.sale_date,
        tx,
      );

      if (steps >= chunkSize) {
        return { done: !next, resumeFromPaperId: next?.id };
      }

      cursorPaperId = next?.id ?? null;
    }

    while (cursorPaperId !== null) {
      await this.cascadeOpeningBalance(cursorPaperId, tx);
      steps++;

      const paper = await this.dairyTraysRepository.findPaperById(
        cursorPaperId,
        tx,
      );
      const next = await this.dairyTraysRepository.getNextPaper(
        paper!.id,
        paper!.sale_date,
        tx,
      );

      if (steps >= chunkSize && next) {
        return { done: false, resumeFromPaperId: next.id };
      }

      cursorPaperId = next?.id ?? null;
    }

    return { done: true };
  }

  // A later paper's own taken / returned are read back exactly as stored.
  private mapStoredRows(
    rows: {
      vehicle_id: number;
      delivery_session: import('../../../../generated/prisma/client.js').DeliverySession;
      tray_type_id: number;
      trays_taken: number | null;
      trays_returned: number | null;
    }[],
  ) {
    const takenByKey = new Map<string, number>();
    const returnedByKey = new Map<string, number>();

    for (const row of rows) {
      const key = buildDairyTrayKey({
        vehicleId: row.vehicle_id,
        deliverySession: row.delivery_session,
        trayTypeId: row.tray_type_id,
      });
      takenByKey.set(key, Number(row.trays_taken ?? 0));
      returnedByKey.set(key, row.trays_returned ?? 0);
    }

    return { takenByKey, returnedByKey };
  }
}
