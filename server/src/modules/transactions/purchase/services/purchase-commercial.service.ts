import { Injectable } from '@nestjs/common';
import { GatepassDatePolicy } from '../../../../generated/prisma/client.js';
import { addDaysUtc } from '../../paper/paper-date.util.js';

export interface PurchaseCommercialContext {
  productLinkId: number;
  purchaseRate: number;
  gatepassDate: Date;
}

@Injectable()
export class PurchaseCommercialService {
  constructor() {}

  // PD-26: sale dates are UTC-midnight calendar dates, so the previous day is
  // computed in UTC and never depends on the server's own timezone.
  private resolveGatepassDate(
    saleDate: Date,
    policy: GatepassDatePolicy,
  ): Date {
    return policy === GatepassDatePolicy.PREVIOUS_DAY
      ? addDaysUtc(saleDate, -1)
      : new Date(saleDate);
  }

  resolveGatepassDateFor(saleDate: Date, policy: GatepassDatePolicy): Date {
    return this.resolveGatepassDate(saleDate, policy);
  }
}
