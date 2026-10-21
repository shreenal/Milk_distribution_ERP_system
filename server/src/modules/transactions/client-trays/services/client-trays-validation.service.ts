import { Injectable, BadRequestException } from '@nestjs/common';
import {
  CLIENT_TRAY_ERROR_MESSAGES,
  MAX_RETURNED_TRAYS,
} from '../client-trays.constants.js';
import { ClientTraysRepository } from '../client-trays.repository.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { buildClientTrayKey } from '../../../../common/utils/client-tray-key.util.js';
import { SaveTrayReturnDto } from '../dto/save-trays-entries.dto.js';
import { SupplyCategory } from '../../../../generated/prisma/client.js';
import { ClientTrayLedgerLine } from '../../../../common/calculators/tray-calculation.service.js';
import {
  ClientTrayType,
  TrayClient,
} from '../../../../types/client-trays.types.js';

@Injectable()
export class ClientTraysValidationService {
  constructor(private readonly clientTraysRepository: ClientTraysRepository) {}

  // Decision 18: the same ledger key twice in one request is rejected.
  validateNoDuplicateEntries(entries: SaveTrayReturnDto[]): void {
    const seen = new Set<string>();

    for (const entry of entries) {
      const key = buildClientTrayKey(entry);

      if (seen.has(key)) {
        throw new BadRequestException(
          CLIENT_TRAY_ERROR_MESSAGES.DUPLICATE_ENTRY(
            entry.clientId,
            entry.trayTypeId,
            entry.category,
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
   * - The cell must exist in that category's grid.
   * - Decisions 1 and 4: returned may exceed today's taken, but never the
   *   available balance (opening + taken), so closing cannot go negative.
   * - Decision 10: a column for an inactive tray type is read-only. Echoing
   *   its current value back is tolerated; changing it is not.
   *   - CT-15.5: with `reconcileInactive` (the admin route) it is the other way
   *   round: only inactive tray types may be changed.
   * - CT-15.6: the row's total return never exceeds MAX_RETURNED_TRAYS. A
   *   save sets the row's total, so checking the submitted value covers
   *   every save, whichever route it came through.
   *
   * All balance problems are reported together.
   */
  validateReturnEntries(
    entries: SaveTrayReturnDto[],
    ledgerLines: ClientTrayLedgerLine[],
    trayTypes: ClientTrayType[],
    clients: TrayClient[],
    reconcileInactive = false,
  ): void {
    const lineByKey = new Map(
      ledgerLines.map((line) => [buildClientTrayKey(line), line]),
    );

    const clientIdsByCategory = new Map<SupplyCategory, Set<number>>();
    const trayTypeIdsByCategory = new Map<SupplyCategory, Set<number>>();

    for (const line of ledgerLines) {
      if (!clientIdsByCategory.has(line.category)) {
        clientIdsByCategory.set(line.category, new Set());
        trayTypeIdsByCategory.set(line.category, new Set());
      }
      clientIdsByCategory.get(line.category)!.add(line.clientId);
      trayTypeIdsByCategory.get(line.category)!.add(line.trayTypeId);
    }

    const trayTypeById = new Map(trayTypes.map((t) => [t.id, t]));
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

    const problems: string[] = [];

    for (const entry of entries) {
      const inGrid =
        clientIdsByCategory.get(entry.category)?.has(entry.clientId) &&
        trayTypeIdsByCategory.get(entry.category)?.has(entry.trayTypeId);

      if (!inGrid) {
        throw new BadRequestException(
          CLIENT_TRAY_ERROR_MESSAGES.TRAY_ROW_NOT_FOUND(entry.clientId),
        );
      }

      const line = lineByKey.get(buildClientTrayKey(entry));
      const clientName =
        clientNameById.get(entry.clientId) ?? `#${entry.clientId}`;
      const trayType = trayTypeById.get(entry.trayTypeId);
      const trayLabel = trayType
        ? `${trayType.master_brand.name} ${trayType.color} tray`
        : `tray type ${entry.trayTypeId}`;

      if (trayType && reconcileInactive && trayType.is_active) {
        problems.push(
          CLIENT_TRAY_ERROR_MESSAGES.TRAY_TYPE_NOT_INACTIVE(
            clientName,
            trayLabel,
          ),
        );
        continue;
      }

      if (
        trayType &&
        !reconcileInactive &&
        !trayType.is_active &&
        entry.returned !== (line?.returned ?? 0)
      ) {
        problems.push(
          CLIENT_TRAY_ERROR_MESSAGES.TRAY_TYPE_INACTIVE(clientName, trayLabel),
        );
        continue;
      }

      if (entry.returned > MAX_RETURNED_TRAYS) {
        problems.push(
          CLIENT_TRAY_ERROR_MESSAGES.RETURN_EXCEEDS_LIMIT(
            clientName,
            trayLabel,
            entry.returned,
          ),
        );
        continue;
      }

      const available = line ? line.opening + line.taken : 0;

      if (entry.returned > available) {
        problems.push(
          CLIENT_TRAY_ERROR_MESSAGES.RETURN_EXCEEDS_BALANCE(
            clientName,
            trayLabel,
            entry.returned,
            available,
          ),
        );
      }
    }

    if (problems.length > 0) {
      throw new BadRequestException({
        message: CLIENT_TRAY_ERROR_MESSAGES.RETURNS_REJECTED,
        details: problems,
      });
    }
  }

  // Decision 29: report every client with incomplete returns, not just the
  // first one found.
  // async validateTrayCompleteness(
  //   sheetId: number,
  //   db: PrismaOrTransaction,
  // ): Promise<void> {
  //   const transactions = await this.clientTraysRepository.getTrayTransactions(
  //     sheetId,
  //     db,
  //   );

  //   if (transactions.length === 0) {
  //     return;
  //   }

  //   const incompleteClientNames = new Set<string>();

  //   for (const transaction of transactions) {
  //     const traysTaken = Number(transaction.trays_taken ?? 0);
  //     const openingBalance = Number(transaction.opening_balance ?? 0);
  //     const traysReturned = transaction.trays_returned;

  //     if (traysTaken > 0 || openingBalance > 0) {
  //       if (traysReturned === null || traysReturned === undefined) {
  //         incompleteClientNames.add(String(transaction.master_client.name));
  //       }
  //     }
  //   }

  //   if (incompleteClientNames.size > 0) {
  //     throw new BadRequestException(
  //       CLIENT_TRAY_ERROR_MESSAGES.INCOMPLETE_TRAY_RETURNS([
  //         ...incompleteClientNames,
  //       ]),
  //     );
  //   }
  // }

  async validateTrayCalculationExists(
    sheetId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const transactions = await this.clientTraysRepository.getTrayTransactions(
      sheetId,
      db,
    );

    if (transactions.length === 0) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.CALCULATION_FAILED,
      );
    }
  }
}
