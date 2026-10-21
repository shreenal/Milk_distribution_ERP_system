import { Injectable } from '@nestjs/common';
import { FinalBillingService } from './final-billing.service.js';

export interface NightBillingResult {
  nightTaxableAmount: number;
  nightGstAmount: number;
  nightBillAmount: number; // final amount, GST included
}

@Injectable()
export class NightBillingService {
  constructor(private readonly finalBillingService: FinalBillingService) {}

  calculate(
    orderedQty: number,
    sellingRate: number,
    gstPercentage: number,
    gstInclusive: boolean,
    pricingQuantity: number,
  ): NightBillingResult {
    const r = this.finalBillingService.calculate(
      orderedQty,
      sellingRate,
      gstPercentage,
      gstInclusive,
      pricingQuantity,
    );
    return {
      nightTaxableAmount: r.taxableAmount,
      nightGstAmount: r.gstAmount,
      nightBillAmount: r.finalBillAmount,
    };
  }
}
