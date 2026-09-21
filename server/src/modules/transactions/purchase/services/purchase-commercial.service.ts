import { BadRequestException, Injectable } from '@nestjs/common';
import { GatepassDatePolicy } from '../../../../generated/prisma/client.js';
import { PurchaseRepository } from '../purchase.repository.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

export interface PurchaseCommercialContext {
  productLinkId: number;
  purchaseRate: number;
  gatepassDate: Date;
}

@Injectable()
export class PurchaseCommercialService {
  constructor(
    private readonly purchaseRepository: PurchaseRepository,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(
    saleDate: Date,
    distributorId: number,
    productId: number,
    gatepassPolicy: GatepassDatePolicy,
    db: PrismaOrTransaction = this.prisma,
    activeOnly = false,
  ): Promise<PurchaseCommercialContext> {
    const productLink = await this.purchaseRepository.getProductLink(
      distributorId,
      productId,
      db,
      activeOnly,
    );

    if (!productLink) {
      throw new BadRequestException(
        activeOnly
          ? `Distributor ${distributorId} does not have an active product link for product ${productId}`
          : `No product link found for distributor ${distributorId} and product ${productId}`,
      );
    }

    const gatepassDate = this.resolveGatepassDate(saleDate, gatepassPolicy);

    const rate = await this.purchaseRepository.findProductLinkRateForDate(
      productLink.id,
      gatepassDate,
      db,
    );

    if (!rate) {
      throw new BadRequestException(
        `Rate not found for distributor ${distributorId} product ${productId} on ${gatepassDate.toISOString().slice(0, 10)}`,
      );
    }

    return {
      productLinkId: productLink.id,
      purchaseRate: Number(rate.purchase_rate),
      gatepassDate,
    };
  }

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
