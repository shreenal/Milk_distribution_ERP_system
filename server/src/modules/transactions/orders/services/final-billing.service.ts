import { Injectable } from '@nestjs/common';

export interface FinalBillingResult {
  gstAmount: number;
  taxableAmount: number;
  finalBillAmount: number;
}

@Injectable()
export class FinalBillingService {
  calculate(
    deliveredQty: number,
    sellingRate: number,
    gstPercentage: number,
    gstInclusive: boolean,
    pricingQuantity: number,
  ): FinalBillingResult {
    const billedQuantity = deliveredQty * pricingQuantity;

    let taxableAmount = 0;
    let gstAmount = 0;
    let finalBillAmount = 0;

    if (gstInclusive) {
      finalBillAmount = billedQuantity * sellingRate;
      taxableAmount = finalBillAmount / (1 + gstPercentage / 100);
      gstAmount = finalBillAmount - taxableAmount;
    } else {
      taxableAmount = billedQuantity * sellingRate;
      gstAmount = taxableAmount * (gstPercentage / 100);
      finalBillAmount = taxableAmount + gstAmount;
    }

    return {
      taxableAmount: Number(taxableAmount.toFixed(2)),
      gstAmount: Number(gstAmount.toFixed(2)),
      finalBillAmount: Number(finalBillAmount.toFixed(2)),
    };
  }
}
