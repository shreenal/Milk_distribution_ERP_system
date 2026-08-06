import { Injectable } from '@nestjs/common';
import { QUANTITY_PRECISION } from '../orders.constants.js';

export interface NightBillingResult {
  nightBillAmount: number;
}

@Injectable()
export class NightBillingService {
  calculate(orderedQty: number, sellingRate: number): NightBillingResult {
    const litres = orderedQty * QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

    return {
      nightBillAmount: Number((litres * sellingRate).toFixed(2)),
    };
  }
}
