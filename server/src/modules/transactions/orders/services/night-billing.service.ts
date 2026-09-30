import { Injectable } from '@nestjs/common';
import { toDecimal, toMoney } from '../../../../common/utils/money.util.js';

export interface NightBillingResult {
  nightBillAmount: number;
}

@Injectable()
export class NightBillingService {
  // Commercial billing model: `pricingQuantity` (from product_order_unit,
  // frozen on the order_sheet_items row) is the authoritative conversion
  // from order units to the billable quantity (e.g. "1 BOX = 10 L" or
  // "1 BOX = 4.8 KG"). packaging_size/packaging_unit are physical
  // descriptors only and are never used for billing math.
  calculate(
    orderedQty: number,
    sellingRate: number,
    pricingQuantity: number,
  ): NightBillingResult {
    const billableQuantity = toDecimal(orderedQty).times(
      toDecimal(pricingQuantity),
    );
    const amount = billableQuantity.times(toDecimal(sellingRate));

    return {
      nightBillAmount: toMoney(amount),
    };
  }
}
