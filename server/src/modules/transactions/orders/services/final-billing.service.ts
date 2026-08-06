import { Injectable } from '@nestjs/common';
import { QUANTITY_PRECISION } from '../orders.constants.js';

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
  ): FinalBillingResult {
    const litres = deliveredQty * QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

    let taxableAmount = 0;
    let gstAmount = 0;
    let finalBillAmount = 0;

    if (gstInclusive) {
      finalBillAmount = litres * sellingRate;
      taxableAmount = finalBillAmount / (1 + gstPercentage / 100);
      gstAmount = finalBillAmount - taxableAmount;
    } else {
      taxableAmount = litres * sellingRate;
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
