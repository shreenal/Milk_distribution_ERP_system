import { Injectable } from '@nestjs/common';
import type {
  ProductTrayRule,
  TrayRuleProduct,
} from '../../types/tray.types.js';
import { PurchaseEntry } from '../../types/dairy-trays.types.js';
import { DeliverySession } from '../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../types/transaction.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface TrayTransactionFields {
  opening_balance: number;
  trays_taken: number;
  trays_returned: number;
  closing_balance: number;
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

      return bSpecificity - aSpecificity;
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

    // Legacy row, created before tray-type freezing existed. Fall back to
    // live resolution so pre-migration papers keep working; this branch
    // should disappear once the backfill has run.
    const rule = this.resolveTrayRule(item.master_product, trayRules);

    return rule?.tray_type_id ?? null;
  }

  calculateTraysTaken(
    orderedQty: number,
    deliveredQty: number,
    useOrderedQuantity: boolean,
  ): number {
    return useOrderedQuantity ? orderedQty : Math.round(deliveredQty);
  }

  calculateClosingBalance(
    opening: number,
    traysTaken: number,
    traysReturned: number | null,
  ): number {
    return opening + traysTaken - (traysReturned ?? 0);
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

  buildTakenMapFromPurchaseEntries(
    purchaseEntries: PurchaseEntry[],
    trayRules: ProductTrayRule[],
  ): Map<number, Map<DeliverySession, Map<number, number>>> {
    const takenMap = new Map<
      number,
      Map<DeliverySession, Map<number, number>>
    >();

    for (const entry of purchaseEntries) {
      const trayTypeId = this.resolveFrozenTrayTypeId(entry, trayRules);

      if (trayTypeId === null) {
        continue;
      }

      let vehicleMap = takenMap.get(entry.vehicle_id);

      if (!vehicleMap) {
        vehicleMap = new Map<DeliverySession, Map<number, number>>();

        takenMap.set(entry.vehicle_id, vehicleMap);
      }

      let sessionMap = vehicleMap.get(entry.delivery_session);

      if (!sessionMap) {
        sessionMap = new Map<number, number>();

        vehicleMap.set(entry.delivery_session, sessionMap);
      }

      const currentTaken = sessionMap.get(trayTypeId) ?? 0;

      sessionMap.set(trayTypeId, currentTaken + Number(entry.purchased_qty));
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
