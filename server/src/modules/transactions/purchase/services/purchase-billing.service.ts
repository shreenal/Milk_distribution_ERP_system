import { Injectable } from '@nestjs/common';
import { QUANTITY_PRECISION } from '../purchase.constants.js';

export interface PurchaseBillingResult {
  purchaseAmount: number;
}

@Injectable()
export class PurchaseBillingService {
  calculate(purchasedQty: number, purchaseRate: number): PurchaseBillingResult {
    const litres = purchasedQty * QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

    return {
      purchaseAmount: Number((litres * purchaseRate).toFixed(2)),
    };
  }
}
