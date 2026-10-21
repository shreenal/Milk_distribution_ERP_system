import { Injectable } from '@nestjs/common';

import {
  PurchaseVarianceSeverity,
  PurchaseVarianceStatus,
} from '../../types/purchase.types.js';
import { toDecimal, toFixedNumber } from '../utils/money.util.js';

import { PURCHASE_VARIANCE_THRESHOLDS } from './purchase-variance.constant.js';

export type PurchaseVarianceResult = {
  hasVariance: boolean;
  /** purchased - allocated: negative = shortfall, positive = surplus */
  variance: number;
  /** absolute percentage; null when nothing was allocated (PD-44) */
  variancePercentage: number | null;
  /** PD-43: the same percentage with its direction */
  signedVariancePercentage: number | null;
  /** purchased / allocated * 100 (PD-40); null when nothing was allocated */
  fulfillmentPercentage: number | null;
  status: PurchaseVarianceStatus;
  severity: PurchaseVarianceSeverity;
  /** PD-41: a CRITICAL shortfall needs attention (never blocks) */
  shortfallWarning: boolean;
};

@Injectable()
export class PurchaseVarianceCalculator {
  calculate(
    allocatedQty: number,
    purchasedQty: number,
  ): PurchaseVarianceResult {
    const allocated = toDecimal(allocatedQty);
    const purchased = toDecimal(purchasedQty);
    const variance = toFixedNumber(purchased.minus(allocated));

    if (allocated.isZero()) {
      // PD-44: buying against no allocation is its own status, not "100%".
      if (purchased.isZero()) {
        return {
          hasVariance: false,
          variance: 0,
          variancePercentage: 0,
          signedVariancePercentage: 0,
          fulfillmentPercentage: null,
          status: PurchaseVarianceStatus.MATCHED,
          severity: PurchaseVarianceSeverity.NONE,
          shortfallWarning: false,
        };
      }
      return {
        hasVariance: true,
        variance,
        variancePercentage: null,
        signedVariancePercentage: null,
        fulfillmentPercentage: null,
        status: PurchaseVarianceStatus.UNPLANNED_ALLOCATION,
        severity: PurchaseVarianceSeverity.CRITICAL,
        shortfallWarning: false,
      };
    }

    const diff = purchased.minus(allocated);
    const percentage = toFixedNumber(
      diff.abs().dividedBy(allocated).times(100),
    );
    const status = diff.isZero()
      ? PurchaseVarianceStatus.MATCHED
      : diff.isNegative()
        ? PurchaseVarianceStatus.SHORTFALL
        : PurchaseVarianceStatus.SURPLUS;
    const severity = this.calculateSeverity(percentage);

    return {
      hasVariance: !diff.isZero(),
      variance,
      variancePercentage: percentage,
      signedVariancePercentage: diff.isNegative() ? -percentage : percentage,
      fulfillmentPercentage: toFixedNumber(
        purchased.dividedBy(allocated).times(100),
      ),
      status,
      severity,
      shortfallWarning:
        status === PurchaseVarianceStatus.SHORTFALL &&
        severity === PurchaseVarianceSeverity.CRITICAL,
    };
  }

  private calculateSeverity(
    variancePercentage: number,
  ): PurchaseVarianceSeverity {
    if (variancePercentage === 0) return PurchaseVarianceSeverity.NONE;
    if (variancePercentage <= PURCHASE_VARIANCE_THRESHOLDS.LOW)
      return PurchaseVarianceSeverity.LOW;
    if (variancePercentage <= PURCHASE_VARIANCE_THRESHOLDS.MEDIUM)
      return PurchaseVarianceSeverity.MEDIUM;
    if (variancePercentage <= PURCHASE_VARIANCE_THRESHOLDS.HIGH)
      return PurchaseVarianceSeverity.HIGH;
    return PurchaseVarianceSeverity.CRITICAL;
  }
}
