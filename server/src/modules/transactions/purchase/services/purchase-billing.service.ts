import { Injectable } from '@nestjs/common';

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
    const purchasedQuantity = purchasedQty * pricingQuantity;

    return {
      purchaseAmount: Number((purchasedQuantity * purchaseRate).toFixed(2)),
    };
  }
}
