import { ConflictException, Injectable } from '@nestjs/common';
import {
  DeliverySession,
  Prisma,
} from '../../../../generated/prisma/client.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import {
  DairyReturnConflict,
  DairyTrayLedgerLine,
} from '../../../../types/dairy-trays.types.js';
import { DairyTraysRepository } from '../dairy-trays.repository.js';
import { DAIRY_TRAYS_ERROR_MESSAGES as MSG } from '../dairy-trays.constants.js';
import {
  buildDairyTrayKey,
  describeTrayType,
  describeVehicle,
  parseDairyTrayKey,
} from '../dairy-trays.util.js';

/**
 * The one place that decides what a paper's dairy tray ledger is.
 *
 * Opening comes from the latest earlier stored closing (across gaps, DT-6.3),
 * taken comes from the paper's purchase entries (DT-6.4), returned is the
 * stored, employee-entered value (DT-4.6). Closing = opening + taken - returned.
 */
@Injectable()
export class DairyTraysLedgerService {
  constructor(
    private readonly repository: DairyTraysRepository,
    private readonly trayCalculationService: TrayCalculationService,
  ) {}

  /** Raw ingredients of the ledger. `dairyTrayPaperId` is null when no header exists. */
  async loadInputs(
    paper: { id: number; sale_date: Date },
    dairyTrayPaperId: number | null,
    db: PrismaOrTransaction,
  ) {
    const [purchaseEntries, trayRules, openingBalances] = await Promise.all([
      this.repository.getPurchaseEntries(paper.id, db),
      this.repository.getProductTrayRules(db),
      this.repository.getOpeningBalances(paper.sale_date, db),
    ]);

    const stored =
      dairyTrayPaperId === null
        ? []
        : await this.repository.getCurrentTrayTransactions(
            dairyTrayPaperId,
            db,
          );

    // DT-6.4 / PD-28: summed per vehicle + session + tray type, rounded once.
    // DT-7.5: a zero purchase yields a key with 0 trays. That key is only a
    // calculation key; whether a row is stored is decided by buildLedger
    // (a key with opening 0, taken 0 and return 0 stores no row).
    const takenByKey = this.trayCalculationService.buildDairyTakenByKey(
      purchaseEntries,
      trayRules,
    );

    // DT-4.6: an entry that was never made is 0, never null.
    const returnedByKey = new Map<string, number>(
      stored.map((row) => [
        buildDairyTrayKey({
          vehicleId: row.vehicle_id,
          deliverySession: row.delivery_session,
          trayTypeId: row.tray_type_id,
        }),
        row.trays_returned ?? 0,
      ]),
    );

    return { openingBalances, takenByKey, returnedByKey, stored };
  }

  /**
   * Display / validation view of the ledger. It never throws on legacy data:
   * a stored positive return with no activity is kept visible (DT-7.2), so a
   * stranded balance can never be hidden by the grid.
   */
  async loadLedger(
    paper: { id: number; sale_date: Date },
    dairyTrayPaperId: number | null,
    db: PrismaOrTransaction,
  ) {
    const inputs = await this.loadInputs(paper, dairyTrayPaperId, db);

    const lines = this.buildLedger(
      inputs.openingBalances,
      inputs.takenByKey,
      inputs.returnedByKey,
      true,
    );

    const [vehicles, trayTypes] = await Promise.all([
      this.repository.getVehiclesByIds(
        [...new Set(lines.map((line) => line.vehicleId))],
        db,
      ),
      this.repository.getAllTrayTypes(db),
    ]);

    return { ...inputs, lines, vehicles, trayTypes };
  }

  /**
   * DT-7.1 / DT-7.2: a line exists only while it carries an opening balance
   * or a positive taken quantity. A zero-activity line is dropped, but never
   * one that still holds a positive return: strict mode treats that as a bug
   * in the caller (which must run assertNoReturnConflicts first); display
   * mode (`keepPositiveReturns`) keeps it visible instead.
   */
  buildLedger(
    opening: Map<string, number>,
    taken: Map<string, number>,
    returned: Map<string, number>,
    keepPositiveReturns = false,
  ): DairyTrayLedgerLine[] {
    const keys = new Set<string>([
      ...opening.keys(),
      ...taken.keys(),
      ...returned.keys(),
    ]);
    const lines: DairyTrayLedgerLine[] = [];

    for (const key of keys) {
      const openingBalance = opening.get(key) ?? 0;
      const traysTaken = taken.get(key) ?? 0;
      const traysReturned = returned.get(key) ?? 0;

      const hasActivity = openingBalance !== 0 || traysTaken > 0;

      if (!hasActivity) {
        if (traysReturned > 0 && !keepPositiveReturns) {
          throw new Error(
            `Refusing to drop dairy tray ledger row ${key}: it still has ${traysReturned} returned trays`,
          );
        }
        if (traysReturned <= 0) continue;
      }

      lines.push({
        ...parseDairyTrayKey(key),
        opening: openingBalance,
        taken: traysTaken,
        returned: traysReturned,
        closing: this.trayCalculationService.calculateClosingBalance(
          openingBalance,
          traysTaken,
          traysReturned,
        ),
      });
    }

    return lines;
  }

  /** DT-6.5: rows whose stored return is higher than opening + taken. */
  findReturnConflicts(
    opening: Map<string, number>,
    taken: Map<string, number>,
    returned: Map<string, number>,
  ): DairyReturnConflict[] {
    const conflicts: DairyReturnConflict[] = [];

    for (const [key, value] of returned) {
      if (value <= 0) continue;

      const available = (opening.get(key) ?? 0) + (taken.get(key) ?? 0);

      if (value > available) {
        conflicts.push({
          ...parseDairyTrayKey(key),
          returned: value,
          available,
        });
      }
    }

    return conflicts;
  }

  /**
   * DT-6.5: refuses (409) a change that would leave a stored return above its
   * available balance. Returns are never capped or dropped to make it fit.
   * The details name every offending row, so a failed background job shows
   * the same list in propagation_outbox.last_error.
   */
  async assertNoReturnConflicts(
    opening: Map<string, number>,
    taken: Map<string, number>,
    returned: Map<string, number>,
    saleDate: Date,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const conflicts = this.findReturnConflicts(opening, taken, returned);

    if (conflicts.length === 0) return;

    const [vehicles, trayTypes] = await Promise.all([
      this.repository.getVehiclesByIds(
        [...new Set(conflicts.map((c) => c.vehicleId))],
        db,
      ),
      this.repository.getAllTrayTypes(db),
    ]);

    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const trayTypeById = new Map(trayTypes.map((t) => [t.id, t]));
    const date = saleDate.toISOString().slice(0, 10);

    throw new ConflictException({
      message: MSG.RETURN_DISCREPANCY,
      details: conflicts.map((c) => {
        const vehicle = vehicleById.get(c.vehicleId);
        const trayType = trayTypeById.get(c.trayTypeId);

        return MSG.RETURN_DISCREPANCY_DETAIL(
          date,
          vehicle ? describeVehicle(vehicle) : `#${c.vehicleId}`,
          c.deliverySession,
          trayType ? describeTrayType(trayType) : `tray type ${c.trayTypeId}`,
          c.returned,
          c.available,
        );
      }),
    });
  }

  /**
   * DT-9.6: true when writing `lines` would change what is stored (a row
   * added, removed, or any of opening / taken / returned / closing differs).
   * A null stored return counts as 0. Used so the token only moves when
   * dairy tray data really changes.
   */
  hasLedgerChanged(
    stored: {
      vehicle_id: number;
      delivery_session: DeliverySession;
      tray_type_id: number;
      opening_balance: number;
      trays_taken: number;
      trays_returned: number | null;
      closing_balance: number;
    }[],
    lines: DairyTrayLedgerLine[],
  ): boolean {
    if (stored.length !== lines.length) return true;

    const storedByKey = new Map(
      stored.map((row) => [
        buildDairyTrayKey({
          vehicleId: row.vehicle_id,
          deliverySession: row.delivery_session,
          trayTypeId: row.tray_type_id,
        }),
        row,
      ]),
    );

    return lines.some((line) => {
      const row = storedByKey.get(buildDairyTrayKey(line));

      return (
        !row ||
        row.opening_balance !== line.opening ||
        row.trays_taken !== line.taken ||
        (row.trays_returned ?? 0) !== line.returned ||
        row.closing_balance !== line.closing
      );
    });
  }

  toTransactionInput(
    dairyTrayPaperId: number,
    line: DairyTrayLedgerLine,
  ): Prisma.dairy_tray_transactionCreateManyInput {
    return {
      dairy_tray_paper_id: dairyTrayPaperId,
      vehicle_id: line.vehicleId,
      tray_type_id: line.trayTypeId,
      delivery_session: line.deliverySession,
      opening_balance: line.opening,
      trays_taken: line.taken,
      trays_returned: line.returned,
      closing_balance: line.closing,
    };
  }
}
