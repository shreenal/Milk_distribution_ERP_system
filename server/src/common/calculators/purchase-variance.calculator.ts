import { Injectable } from '@nestjs/common';

import { PurchaseVarianceSeverity } from '../../types/purchase.types.js';

import { PURCHASE_VARIANCE_THRESHOLDS } from './purchase-variance.constant.js';

export type PurchaseVarianceResult = {
  hasVariance: boolean;
  variance: number;
  variancePercentage: number;
  severity: PurchaseVarianceSeverity;
};

@Injectable()
export class PurchaseVarianceCalculator {
  calculate(
    allocatedQty: number,
    purchasedQty: number,
  ): PurchaseVarianceResult {
    const variance = purchasedQty - allocatedQty;
    const hasVariance = variance !== 0;

    let variancePercentage: number;
    if (allocatedQty === 0) {
      // Purchased against zero allocation is the most severe case, not "no
      // variance" — percentage-of-allocated is undefined here, so treat any
      // nonzero purchase as maximal variance rather than silently reading 0%.
      variancePercentage = purchasedQty === 0 ? 0 : 100;
    } else {
      variancePercentage = Number(
        ((Math.abs(variance) / allocatedQty) * 100).toFixed(2),
      );
    }

    return {
      hasVariance,
      variance,
      variancePercentage,
      severity: this.calculateSeverity(variancePercentage),
    };
  }

  private calculateSeverity(
    variancePercentage: number,
  ): PurchaseVarianceSeverity {
    if (variancePercentage === 0) {
      return PurchaseVarianceSeverity.NONE;
    }

    if (variancePercentage <= PURCHASE_VARIANCE_THRESHOLDS.LOW) {
      return PurchaseVarianceSeverity.LOW;
    }

    if (variancePercentage <= PURCHASE_VARIANCE_THRESHOLDS.MEDIUM) {
      return PurchaseVarianceSeverity.MEDIUM;
    }

    if (variancePercentage <= PURCHASE_VARIANCE_THRESHOLDS.HIGH) {
      return PurchaseVarianceSeverity.HIGH;
    }

    return PurchaseVarianceSeverity.CRITICAL;
  }
}
