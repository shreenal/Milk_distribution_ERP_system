import { Injectable } from '@nestjs/common';
import type {
  ProductTrayRule,
  TrayRuleProduct,
} from '../../types/tray.types.js';
import { PurchaseEntry } from '../../types/dairy-trays.types.js';
import {
  DeliverySession,
  SupplyCategory,
} from '../../generated/prisma/client.js';
import {
  PrismaOrTransaction,
  TrayTransactionEntry,
} from '../../types/transaction.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildClientTrayKey,
  ClientTrayKey,
  parseClientTrayKey,
} from '../utils/client-tray-key.util.js';
import { Decimal, Moneyish, toDecimal } from '../utils/money.util.js';

export interface TrayTransactionFields {
  opening_balance: number;
  trays_taken: number;
  trays_returned: number;
  closing_balance: number;
}

/** An order line, as far as client-tray calculation is concerned. */
export interface TrayTakenItem {
  client_id: number;
  ordered_qty: Moneyish;
  delivered_qty: Moneyish;
  tray_type_id?: number | null;
  master_product: TrayRuleProduct & {
    master_product_group: { category: SupplyCategory };
  };
}

export interface ClientTrayLedgerLine extends ClientTrayKey {
  opening: number;
  taken: number;
  // CT-15.4: a return that was never entered is 0, never null.
  returned: number;
  closing: number;
}

/** A row whose stored return is higher than opening + taken. */
export interface ReturnConflict extends ClientTrayKey {
  returned: number;
  available: number;
}

@Injectable()
export class TrayCalculationService {
  constructor(private readonly prisma: PrismaService) {}
  resolveTrayRule(
    product: TrayRuleProduct,
    trayRules: ProductTrayRule[],
  ): ProductTrayRule | null {
    const matchingRules = trayRules.filter((rule) => {
      const baseMatch =
        (rule.brand_id === null || rule.brand_id === product.brand_id) &&
        (rule.product_group_id === null ||
          rule.product_group_id === product.product_group_id) &&
        (rule.product_type_id === null ||
          rule.product_type_id === product.product_type_id);

      if (!baseMatch) {
        return false;
      }

      if (rule.applies_to_packaging) {
        return rule.packaging_type_id === product.packaging_type_id;
      }

      return true;
    });

    if (matchingRules.length === 0) {
      return null;
    }

    matchingRules.sort((a, b) => {
      const aSpecificity =
        Number(a.brand_id !== null) +
        Number(a.product_group_id !== null) +
        Number(a.product_type_id !== null) +
        Number(a.packaging_type_id !== null);

      const bSpecificity =
        Number(b.brand_id !== null) +
        Number(b.product_group_id !== null) +
        Number(b.product_type_id !== null) +
        Number(b.packaging_type_id !== null);

      return bSpecificity - aSpecificity || a.id - b.id;
    });

    return matchingRules[0];
  }

  resolveFrozenTrayTypeId(
    item: { tray_type_id?: number | null; master_product: TrayRuleProduct },
    trayRules: ProductTrayRule[],
  ): number | null {
    if (item.tray_type_id !== null && item.tray_type_id !== undefined) {
      return item.tray_type_id;
    }

    const rule = this.resolveTrayRule(item.master_product, trayRules);

    return rule?.tray_type_id ?? null;
  }

  /**
   * Decision 6: quantities are summed per (client, tray type, category)
   * FIRST and rounded once, instead of rounding each order line. Three lines
   * of 0.4 crates are 1.2 crates = 1 tray, not 0 trays.
   *
   * Ordered quantities are used until morning delivered quantities are saved
   * in Orders (decisions 5 and 30), which is the caller's `useOrderedQuantity`.
   */
  buildTakenMap(
    items: TrayTakenItem[],
    trayRules: ProductTrayRule[],
    useOrderedQuantity: boolean,
  ): Map<string, number> {
    const totals = new Map<string, Decimal>();

    for (const item of items) {
      const trayTypeId = this.resolveFrozenTrayTypeId(item, trayRules);

      if (trayTypeId === null) {
        continue;
      }

      const key = buildClientTrayKey({
        clientId: item.client_id,
        trayTypeId,
        category: item.master_product.master_product_group.category,
      });

      const quantity = toDecimal(
        useOrderedQuantity ? item.ordered_qty : item.delivered_qty,
      );

      totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(quantity));
    }

    const taken = new Map<string, number>();

    for (const [key, total] of totals) {
      taken.set(
        key,
        total.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      );
    }

    return taken;
  }

  // Per-line rounding. Client Trays no longer uses it (decision 6), but it was
  // a public method, so it stays until every other caller is ruled out.
  calculateTraysTaken(
    orderedQty: number,
    deliveredQty: number,
    useOrderedQuantity: boolean,
  ): number {
    return Math.round(useOrderedQuantity ? orderedQty : deliveredQty);
  }

  calculateClosingBalance(
    opening: number,
    traysTaken: number,
    traysReturned: number | null,
  ): number {
    return opening + traysTaken - (traysReturned ?? 0);
  }

  /**
   * CT-15.1 / CT-15.2: rows whose stored return is higher than what is
   * available (opening + taken). That includes a positive return on a row
   * that would otherwise disappear (nothing opening, nothing taken). The
   * caller refuses the change that caused it; returns are never capped.
   */
  findReturnConflicts(
    opening: Map<string, number>,
    taken: Map<string, number>,
    returned: Map<string, number | null>,
  ): ReturnConflict[] {
    const conflicts: ReturnConflict[] = [];

    for (const [key, value] of returned) {
      if (value === null || value <= 0) {
        continue;
      }

      const available = (opening.get(key) ?? 0) + (taken.get(key) ?? 0);

      if (value > available) {
        conflicts.push({
          ...parseClientTrayKey(key),
          returned: value,
          available,
        });
      }
    }

    return conflicts;
  }

  /**
   * Decisions 7, 11, 12: a ledger line exists only while it carries a
   * nonzero opening balance or a positive taken quantity. Anything else is
   * dropped, but never a row that still has a positive return (CT-15.2):
   * that is a bug in the caller, which must check findReturnConflicts first.
   * CT-15.4: an absent return is 0.
   */
  buildClientTrayLedger(
    opening: Map<string, number>,
    taken: Map<string, number>,
    returned: Map<string, number | null>,
    keepPositiveReturns = false,
  ): ClientTrayLedgerLine[] {
    const keys = new Set<string>([...opening.keys(), ...taken.keys()]);
    const lines: ClientTrayLedgerLine[] = [];

    for (const [key, value] of returned) {
      const kept = (opening.get(key) ?? 0) !== 0 || (taken.get(key) ?? 0) > 0;

      if (!kept && value !== null && value > 0) {
        if (!keepPositiveReturns) {
          throw new Error(
            `Refusing to drop ledger row ${key}: it still has ${value} returned trays`,
          );
        }
        // Display mode: keep the stranded row visible instead of failing.
        keys.add(key);
      }
    }

    for (const key of keys) {
      const openingBalance = opening.get(key) ?? 0;
      const traysTaken = taken.get(key) ?? 0;
      const strandedReturn =
        keepPositiveReturns && (returned.get(key) ?? 0) > 0;

      if (openingBalance === 0 && traysTaken <= 0 && !strandedReturn) {
        continue;
      }

      const traysReturned = returned.get(key) ?? 0;

      lines.push({
        ...parseClientTrayKey(key),
        opening: openingBalance,
        taken: traysTaken,
        returned: traysReturned,
        closing: this.calculateClosingBalance(
          openingBalance,
          traysTaken,
          traysReturned,
        ),
      });
    }

    return lines;
  }

  toTransactionEntry(
    sheetId: number,
    line: ClientTrayLedgerLine,
  ): TrayTransactionEntry {
    return {
      order_sheet_id: sheetId,
      client_id: line.clientId,
      tray_type_id: line.trayTypeId,
      category: line.category,
      opening_balance: line.opening,
      trays_taken: line.taken,
      trays_returned: line.returned,
      closing_balance: line.closing,
    };
  }

  buildTransaction(
    opening: number,
    traysTaken: number,
    traysReturned: number,
  ): TrayTransactionFields {
    return {
      opening_balance: opening,
      trays_taken: traysTaken,
      trays_returned: traysReturned,
      closing_balance: this.calculateClosingBalance(
        opening,
        traysTaken,
        traysReturned,
      ),
    };
  }

  /**
   * PD-28: dairy trays are converted independently of billing. Purchased
   * quantities are summed per (vehicle, session, tray type) FIRST and rounded
   * once, half-up (same rule as Client Trays CT-6.4). A zero purchase still
   * produces a key with 0 trays.
   */
  buildDairyTakenByKey(
    purchaseEntries: PurchaseEntry[],
    trayRules: ProductTrayRule[],
  ): Map<string, number> {
    const totals = new Map<string, Decimal>();

    for (const entry of purchaseEntries) {
      const trayTypeId = this.resolveFrozenTrayTypeId(entry, trayRules);

      if (trayTypeId === null) {
        continue;
      }

      const key = `${entry.vehicle_id}_${entry.delivery_session}_${trayTypeId}`;

      totals.set(
        key,
        (totals.get(key) ?? new Decimal(0)).plus(
          toDecimal(entry.purchased_qty),
        ),
      );
    }

    const taken = new Map<string, number>();

    for (const [key, total] of totals) {
      taken.set(
        key,
        total.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      );
    }

    return taken;
  }

  buildTakenMapFromPurchaseEntries(
    purchaseEntries: PurchaseEntry[],
    trayRules: ProductTrayRule[],
  ): Map<number, Map<DeliverySession, Map<number, number>>> {
    const takenMap = new Map<
      number,
      Map<DeliverySession, Map<number, number>>
    >();

    for (const [key, trays] of this.buildDairyTakenByKey(
      purchaseEntries,
      trayRules,
    )) {
      const [vehicleId, session, trayTypeId] = key.split('_');

      const vehicleMap =
        takenMap.get(Number(vehicleId)) ??
        new Map<DeliverySession, Map<number, number>>();
      takenMap.set(Number(vehicleId), vehicleMap);

      const sessionMap =
        vehicleMap.get(session as DeliverySession) ?? new Map<number, number>();
      vehicleMap.set(session as DeliverySession, sessionMap);

      sessionMap.set(Number(trayTypeId), trays);
    }

    return takenMap;
  }

  async getProductTrayRules(db: PrismaOrTransaction = this.prisma) {
    return db.product_tray_rule.findMany({
      where: { is_active: true },
      include: {
        master_tray_type: { include: { master_brand: true } },
        master_brand: true,
        master_product_group: true,
        master_product_type: true,
        master_packaging_type: true,
      },
    });
  }
}
