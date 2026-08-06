import { Injectable } from '@nestjs/common';
import type {
  ProductTrayRule,
  TrayRuleProduct,
} from '../../types/tray.types.js';
import { PurchaseEntry } from '../../types/dairy-trays.types.js';

export interface TrayTransactionFields {
  opening_balance: number;
  trays_taken: number;
  trays_returned: number;
  closing_balance: number;
}

@Injectable()
export class TrayCalculationService {
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
    traysReturned: number,
  ): number {
    return opening + traysTaken - traysReturned;
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
  ): Map<number, Map<number, number>> {
    const takenMap = new Map<number, Map<number, number>>();

    for (const entry of purchaseEntries) {
      const trayRule = this.resolveTrayRule(entry.master_product, trayRules);

      if (!trayRule) {
        continue;
      }

      let vehicleMap = takenMap.get(entry.vehicle_id);

      if (!vehicleMap) {
        vehicleMap = new Map<number, number>();
        takenMap.set(entry.vehicle_id, vehicleMap);
      }

      const currentTaken = vehicleMap.get(trayRule.tray_type_id) ?? 0;

      vehicleMap.set(
        trayRule.tray_type_id,
        currentTaken + Number(entry.purchased_qty),
      );
    }

    return takenMap;
  }
}
