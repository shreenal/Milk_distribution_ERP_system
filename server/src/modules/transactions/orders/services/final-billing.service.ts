// import { Injectable } from '@nestjs/common';

// export interface FinalBillingResult {
//   gstAmount: number;
//   taxableAmount: number;
//   finalBillAmount: number;
// }

// @Injectable()
// export class FinalBillingService {
//   calculate(
//     deliveredQty: number,
//     sellingRate: number,
//     gstPercentage: number,
//     gstInclusive: boolean,
//     unitsPerOrderUnit: number,
//     packagingSize: number,
//     packagingUnit: string,
//   ): FinalBillingResult {
//     const packageQuantityInLitres = this.toLitres(
//       packagingSize,
//       packagingUnit,
//     );

//     const billedLitres =
//       deliveredQty *
//       unitsPerOrderUnit *
//       packageQuantityInLitres;

//     let taxableAmount = 0;
//     let gstAmount = 0;
//     let finalBillAmount = 0;

//     if (gstInclusive) {
//       finalBillAmount = billedLitres * sellingRate;
//       taxableAmount =
//         finalBillAmount / (1 + gstPercentage / 100);
//       gstAmount = finalBillAmount - taxableAmount;
//     } else {
//       taxableAmount = billedLitres * sellingRate;
//       gstAmount = taxableAmount * (gstPercentage / 100);
//       finalBillAmount = taxableAmount + gstAmount;
//     }

//     return {
//       taxableAmount: Number(taxableAmount.toFixed(2)),
//       gstAmount: Number(gstAmount.toFixed(2)),
//       finalBillAmount: Number(finalBillAmount.toFixed(2)),
//     };
//   }

//   private toLitres(size: number, unit: string): number {
//     switch (unit.toUpperCase()) {
//       case 'ML':
//         return size / 1000;

//       case 'L':
//         return size;

//       default:
//         throw new Error(
//           `Unsupported packaging unit for litre billing: ${unit}`,
//         );
//     }
//   }
// }

import { Injectable } from '@nestjs/common';

export interface FinalBillingResult {
  gstAmount: number;
  taxableAmount: number;
  finalBillAmount: number;
}

@Injectable()
export class FinalBillingService {
  // See NightBillingService: `pricingQuantity` is the frozen commercial
  // conversion basis from order units to the billable quantity.
  // packaging_size/packaging_unit are physical descriptors only and are
  // never used here. GST inclusive/exclusive handling is unchanged.
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