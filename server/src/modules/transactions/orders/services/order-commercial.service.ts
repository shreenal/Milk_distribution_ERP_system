import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, SupplyCategory } from '../../../../generated/prisma/client.js';
import { OrdersRepository } from '../orders.repository.js';

export interface CommercialContext {
  distributorId: number;
  productLinkId: number;

  gstPercentage: number;
  gstInclusive: boolean;
  resolvedViaFallback: boolean;
}

@Injectable()
export class OrderCommercialService {
  private readonly logger = new Logger(OrderCommercialService.name);
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

    const primaryDistributorId =
      category === SupplyCategory.MILK
        ? supplyRules.milkDistributorId
        : supplyRules.nonMilkDistributorId;

    if (!primaryDistributorId) {
      throw new BadRequestException(
        `Missing ${category} distributor supply rule for group ${sheetGroupId}`,
      );
    }

    const eligibleDistributors =
      await this.ordersRepository.getEligibleDistributorsForProduct(
        sheetGroupId,
        productId,
        product.brand_id,
        product.product_group_id,
        category,
        primaryDistributorId,
        tx,
      );

    if (eligibleDistributors.length === 0) {
      throw new BadRequestException(
        `No eligible distributor found for product ${productId} in group ${sheetGroupId}`,
      );
    }

    const linkByDistributor = await this.ordersRepository.getProductLinksBatch(
      eligibleDistributors.map((d) => d.distributorId),
      productId,
      tx,
      true,
    );

    let selectedDistributor: (typeof eligibleDistributors)[number] | null =
      null;
    let productLink: Awaited<ReturnType<OrdersRepository['getProductLink']>> =
      null;
    let resolvedViaFallback = false;
    for (const candidate of eligibleDistributors) {
      const link = linkByDistributor.get(candidate.distributorId);

      if (link) {
        if (candidate.distributorId !== primaryDistributorId) {
          resolvedViaFallback = true;
          this.logger.warn(
            `Product ${productId} in group ${sheetGroupId}: primary distributor ${primaryDistributorId} has no product link, falling back to distributor ${candidate.distributorId} (priority ${candidate.priority})`,
          );
        }
        selectedDistributor = candidate;
        productLink = link;
        break;
      }
    }

    if (!selectedDistributor || !productLink) {
      throw new BadRequestException(
        `No product link found for any eligible distributor for product ${productId} in group ${sheetGroupId}`,
      );
    }

    return {
      distributorId: selectedDistributor.distributorId,
      productLinkId: productLink.id,

      gstPercentage: Number(product.gst_percentage ?? 0),
      gstInclusive: product.is_gst_inclusive,
      resolvedViaFallback,
    };
  }
}
