import { Injectable } from '@nestjs/common';
import {
  Decimal,
  toDecimal,
  toMoney,
} from '../../../../common/utils/money.util.js';

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
    const billedQuantity = toDecimal(deliveredQty).times(
      toDecimal(pricingQuantity),
    );
    const rate = toDecimal(sellingRate);
    const gstPct = toDecimal(gstPercentage);

    let taxableAmount: Decimal;
    let gstAmount: Decimal;
    let finalBillAmount: Decimal;

    if (gstInclusive) {
      finalBillAmount = billedQuantity.times(rate);
      taxableAmount = finalBillAmount.dividedBy(
        new Decimal(1).plus(gstPct.dividedBy(100)),
      );

      const roundedFinal = toMoney(finalBillAmount);
      const roundedTaxable = toMoney(taxableAmount);

      return {
        taxableAmount: roundedTaxable,
        // L1: derive gst from the two already-rounded amounts instead of
        // rounding an independently-computed gstAmount, so the three
        // numbers always foot exactly (no stray ₹0.01).
        gstAmount: Number((roundedFinal - roundedTaxable).toFixed(2)),
        finalBillAmount: roundedFinal,
      };
    }

    taxableAmount = billedQuantity.times(rate);
    gstAmount = taxableAmount.times(gstPct.dividedBy(100));
    finalBillAmount = taxableAmount.plus(gstAmount);

    const roundedTaxable = toMoney(taxableAmount);
    const roundedFinal = toMoney(finalBillAmount);

    return {
      taxableAmount: roundedTaxable,
      gstAmount: Number((roundedFinal - roundedTaxable).toFixed(2)),
      finalBillAmount: roundedFinal,
    };
  }
}
