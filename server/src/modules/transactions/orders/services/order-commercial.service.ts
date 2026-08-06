import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SupplyCategory } from '../../../../generated/prisma/client.js';
import { OrdersRepository } from '../orders.repository.js';

export interface CommercialContext {
  distributorId: number;
  productLinkId: number;

  gstPercentage: number;
  gstInclusive: boolean;
}

@Injectable()
export class OrderCommercialService {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async resolve(
    sheetGroupId: number,
    productId: number,
    supplyRules: {
      milkDistributorId: number | null;
      nonMilkDistributorId: number | null;
    },
    tx: Prisma.TransactionClient,
  ): Promise<CommercialContext> {
    const product = await this.ordersRepository.getProductWithGroup(
      productId,
      tx,
    );
    const category = product.master_product_group.category;

    const distributorId =
      category === SupplyCategory.MILK
        ? supplyRules.milkDistributorId
        : supplyRules.nonMilkDistributorId;

    if (!distributorId) {
      throw new BadRequestException(
        `Missing ${category} distributor supply rule for group ${sheetGroupId}`,
      );
    }

    const canProcure = await this.ordersRepository.canDistributorProcureProduct(
      distributorId,
      product.brand_id,
      product.product_group_id,
      category,
      tx,
    );

    if (!canProcure) {
      throw new BadRequestException(
        `Distributor ${distributorId} cannot procure product ${productId}`,
      );
    }

    const productLink = await this.ordersRepository.getProductLink(
      distributorId,
      productId,
      tx,
    );

    if (!productLink) {
      throw new BadRequestException(
        `No product link found for distributor ${distributorId} and product ${productId}`,
      );
    }

    return {
      distributorId,
      productLinkId: productLink.id,

      gstPercentage: Number(product.gst_percentage ?? 0),
      gstInclusive: product.is_gst_inclusive,
    };
  }
}
