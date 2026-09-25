import { Injectable } from '@nestjs/common';
import { GatepassDatePolicy } from '../../../../generated/prisma/client.js';

export interface PurchaseCommercialContext {
  productLinkId: number;
  purchaseRate: number;
  gatepassDate: Date;
}

@Injectable()
export class PurchaseCommercialService {
  constructor() {}

  private resolveGatepassDate(
    saleDate: Date,
    policy: GatepassDatePolicy,
  ): Date {
    const gatepassDate = new Date(saleDate);

    if (policy === GatepassDatePolicy.PREVIOUS_DAY) {
      gatepassDate.setDate(gatepassDate.getDate() - 1);
    }

    return gatepassDate;
  }

  resolveGatepassDateFor(saleDate: Date, policy: GatepassDatePolicy): Date {
    return this.resolveGatepassDate(saleDate, policy);
  }
}
