import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SaveDairyTrayEntryDto } from '../dto/save-dairy-tray-entry.dto.js';
import {
  DAIRY_TRAYS_ERROR_MESSAGES as MSG,
  MAX_RETURNED_TRAYS,
} from '../dairy-trays.constants.js';
import { DairyTraysRepository } from '../dairy-trays.repository.js';
import { DairyTraysLedgerService } from './dairy-trays-ledger.service.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import {
  DairyTrayLedgerLine,
  Vehicle,
} from '../../../../types/dairy-trays.types.js';
import { TrayType } from '../../../../types/tray.types.js';
import {
  buildDairyTrayKey,
  describeTrayType,
  describeVehicle,
} from '../dairy-trays.util.js';

@Injectable()
export class DairyTraysValidationService {
  constructor(
    private readonly dairytraysrepository: DairyTraysRepository,
    private readonly ledgerService: DairyTraysLedgerService,
  ) {}

  // DT-4.4: the same vehicle + session + tray type twice is rejected.
  validateNoDuplicateEntries(entries: SaveDairyTrayEntryDto[]): void {
    const seen = new Set<string>();

    for (const entry of entries) {
      const key = buildDairyTrayKey(entry);

      if (seen.has(key)) {
        throw new BadRequestException(
          MSG.DUPLICATE_ENTRY(
            entry.vehicleId,
            entry.trayTypeId,
            entry.deliverySession,
          ),
        );
      }

      seen.add(key);
    }
  }

  /**
   * Checks submitted returns against the ledger the server just calculated
   * (never against anything the client sent).
   *
   * - DT-5.6: the cell must exist in the grid (row for that vehicle + session,
   *   column for that tray type).
   * - DT-5.7: an inactive vehicle or tray type is read-only; echoing the
   *   stored value is tolerated, changing it is not. With `reconcileInactive`
   *   (admin route, DT-5.11) it is the other way round.
   * - DT-5.12: the row's total return never exceeds MAX_RETURNED_TRAYS.
   * - DT-5.5: returned never exceeds the available balance (opening + taken).
   *
   * All balance problems are reported together.
   */
  validateReturnEntries(
    entries: SaveDairyTrayEntryDto[],
    ledger: {
      lines: DairyTrayLedgerLine[];
      vehicles: Vehicle[];
      trayTypes: TrayType[];
    },
    reconcileInactive = false,
  ): void {
    const lineByKey = new Map(
      ledger.lines.map((line) => [buildDairyTrayKey(line), line]),
    );
    const rowKeys = new Set(
      ledger.lines.map((line) => `${line.vehicleId}_${line.deliverySession}`),
    );
    const columnTrayTypeIds = new Set<number>([
      ...ledger.trayTypes.filter((t) => t.is_active).map((t) => t.id),
      ...ledger.lines.map((line) => line.trayTypeId),
    ]);
    const vehicleById = new Map(ledger.vehicles.map((v) => [v.id, v]));
    const trayTypeById = new Map(ledger.trayTypes.map((t) => [t.id, t]));

    const problems: string[] = [];

    for (const entry of entries) {
      const vehicle = vehicleById.get(entry.vehicleId);
      const trayType = trayTypeById.get(entry.trayTypeId);

      if (
        !rowKeys.has(`${entry.vehicleId}_${entry.deliverySession}`) ||
        !columnTrayTypeIds.has(entry.trayTypeId) ||
        !vehicle ||
        !trayType
      ) {
        throw new BadRequestException(
          MSG.ROW_NOT_FOUND(entry.vehicleId, entry.deliverySession),
        );
      }

      const line = lineByKey.get(buildDairyTrayKey(entry));
      const vehicleName = describeVehicle(vehicle);
      const trayLabel = describeTrayType(trayType);
      const inactive = !vehicle.is_active || !trayType.is_active;

      if (reconcileInactive && !inactive) {
        problems.push(
          MSG.NOT_INACTIVE(vehicleName, entry.deliverySession, trayLabel),
        );
        continue;
      }

      if (
        !reconcileInactive &&
        inactive &&
        entry.returned !== (line?.returned ?? 0)
      ) {
        problems.push(
          MSG.INACTIVE_READ_ONLY(vehicleName, entry.deliverySession, trayLabel),
        );
        continue;
      }

      if (entry.returned > MAX_RETURNED_TRAYS) {
        problems.push(
          MSG.RETURN_EXCEEDS_LIMIT(
            vehicleName,
            entry.deliverySession,
            trayLabel,
            entry.returned,
          ),
        );
        continue;
      }

      const available = line ? line.opening + line.taken : 0;

      if (entry.returned > available) {
        problems.push(
          MSG.RETURN_EXCEEDS_BALANCE(
            vehicleName,
            entry.deliverySession,
            trayLabel,
            entry.returned,
            available,
          ),
        );
      }
    }

    if (problems.length > 0) {
      throw new BadRequestException({
        message: MSG.RETURNS_REJECTED,
        details: problems,
      });
    }
  }

  /**
   * DT-12: submission gate (morning submit and re-finalize of a reopened
   * paper). Everything that blocks is reported at once:
   *  - the dairy tray header must exist;
   *  - every purchase-backed line (taken > 0) must have a stored row;
   *  - no stored return may exceed its available balance;
   *  - no closing balance may be negative.
   * It does NOT require returns to be entered (DT-12.2): an untouched return
   * is 0.
   */
  async validateDairyTraysComplete(paperId: number, db: PrismaOrTransaction) {
    const paper = await this.dairytraysrepository.findPaperById(paperId, db);

    if (!paper) {
      throw new NotFoundException(MSG.PAPER_NOT_FOUND);
    }

    const dairyTrayPaper =
      await this.dairytraysrepository.findDairyTrayPaperByOrderPaperId(
        paperId,
        db,
      );

    if (!dairyTrayPaper) {
      throw new BadRequestException(MSG.DAIRY_TRAY_PAPER_NOT_FOUND);
    }

    const ledger = await this.ledgerService.loadLedger(
      paper,
      dairyTrayPaper.id,
      db,
    );

    const vehicleById = new Map(ledger.vehicles.map((v) => [v.id, v]));
    const trayTypeById = new Map(ledger.trayTypes.map((t) => [t.id, t]));
    const labelOf = (line: {
      vehicleId: number;
      trayTypeId: number;
    }): [string, string] => {
      const vehicle = vehicleById.get(line.vehicleId);
      const trayType = trayTypeById.get(line.trayTypeId);
      return [
        vehicle ? describeVehicle(vehicle) : `#${line.vehicleId}`,
        trayType ? describeTrayType(trayType) : `tray type ${line.trayTypeId}`,
      ];
    };

    const details: string[] = [];

    for (const line of ledger.lines) {
      if (
        line.taken > 0 &&
        !ledger.returnedByKey.has(buildDairyTrayKey(line))
      ) {
        const [vehicleName, trayLabel] = labelOf(line);
        details.push(
          MSG.MISSING_ENTRY(vehicleName, line.deliverySession, trayLabel),
        );
      }
    }

    const conflictKeys = new Set<string>();

    for (const conflict of this.ledgerService.findReturnConflicts(
      ledger.openingBalances,
      ledger.takenByKey,
      ledger.returnedByKey,
    )) {
      conflictKeys.add(buildDairyTrayKey(conflict));
      const [vehicleName, trayLabel] = labelOf(conflict);
      details.push(
        MSG.RETURN_EXCEEDS_BALANCE(
          vehicleName,
          conflict.deliverySession,
          trayLabel,
          conflict.returned,
          conflict.available,
        ),
      );
    }

    for (const line of ledger.lines) {
      if (line.closing < 0 && !conflictKeys.has(buildDairyTrayKey(line))) {
        const [vehicleName, trayLabel] = labelOf(line);
        details.push(
          MSG.NEGATIVE_CLOSING(
            vehicleName,
            line.deliverySession,
            trayLabel,
            line.closing,
          ),
        );
      }
    }

    if (details.length > 0) {
      throw new BadRequestException({
        message: MSG.NOT_READY_FOR_SUBMISSION,
        details,
      });
    }
  }
}
