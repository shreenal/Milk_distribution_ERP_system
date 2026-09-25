import { Injectable } from '@nestjs/common';

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
    const billableQuantity = orderedQty * pricingQuantity;

    return {
      nightBillAmount: Number((billableQuantity * sellingRate).toFixed(2)),
    };
  }
}
