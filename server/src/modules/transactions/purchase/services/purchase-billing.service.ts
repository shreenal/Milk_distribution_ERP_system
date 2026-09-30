// FULL FILE REPLACEMENT for purchase/services/purchase-billing.service.ts
// FIX C3: replaced Number/toFixed math with Decimal.
import { Injectable } from '@nestjs/common';
import { toDecimal, toMoney } from '../../../../common/utils/money.util.js';

export interface PurchaseBillingResult {
  purchaseAmount: number;
}

@Injectable()
export class PurchaseBillingService {
  // See NightBillingService/FinalBillingService: `pricingQuantity` is the
  // frozen commercial conversion basis from order units to the billable
  // quantity. packaging_size/packaging_unit are physical descriptors only
  // and are never used here.
  calculate(
    purchasedQty: number,
    purchaseRate: number,
    pricingQuantity: number,
  ): PurchaseBillingResult {
    const purchasedQuantity = toDecimal(purchasedQty).times(
      toDecimal(pricingQuantity),
    );
    const amount = purchasedQuantity.times(toDecimal(purchaseRate));

    return {
      purchaseAmount: toMoney(amount),
    };
  }
}
