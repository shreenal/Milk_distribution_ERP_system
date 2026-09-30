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
    clientId: number,
    sheetGroupId: number,
    productId: number,
    tx: Prisma.TransactionClient,
  ): Promise<CommercialContext> {
    const product = await this.ordersRepository.getProductWithGroup(
      productId,
      tx,
    );

    const category = product.master_product_group.category;

    const clientCategorySupplier =
      await this.ordersRepository.getClientCategorySupplier(
        clientId,
        category,
        tx,
      );

    const primaryDistributorId =
      clientCategorySupplier?.supplier_distributor_id;

    if (!primaryDistributorId) {
      throw new BadRequestException(
        `Missing ${category} supplier for client ${clientId}`,
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

  async resolveBatch(
    pairs: { clientId: number; productId: number }[],
    sheetGroupId: number,
    tx: Prisma.TransactionClient,
  ): Promise<Map<string, CommercialContext>> {
    const result = new Map<string, CommercialContext>();
    if (pairs.length === 0) return result;

    const uniqueProductIds = [...new Set(pairs.map((p) => p.productId))];
    const productMap = await this.ordersRepository.getProductsWithGroupBatch(
      uniqueProductIds,
      tx,
    );

    for (const productId of uniqueProductIds) {
      if (!productMap.get(productId)) {
        throw new BadRequestException(`Product ${productId} not found`);
      }
    }

    const categoryByProduct = new Map<number, SupplyCategory>();
    for (const [id, product] of productMap) {
      categoryByProduct.set(id, product.master_product_group.category);
    }

    const clientCategoryPairs = dedupeStrings(
      pairs.map((p) => `${p.clientId}_${categoryByProduct.get(p.productId)}`),
    ).map((key) => {
      const [clientId, category] = key.split('_');
      return {
        clientId: Number(clientId),
        category: category as SupplyCategory,
      };
    });

    const supplierMap =
      await this.ordersRepository.getClientCategorySuppliersBatch(
        clientCategoryPairs,
        tx,
      );

    const procurementTriples = dedupeStrings(
      pairs.map((p) => {
        const product = productMap.get(p.productId)!;
        return `${product.brand_id}_${categoryByProduct.get(p.productId)}_${product.product_group_id}`;
      }),
    ).map((key) => {
      const [brandId, category, productGroupId] = key.split('_');
      return {
        brandId: Number(brandId),
        category: category as SupplyCategory,
        productGroupId: Number(productGroupId),
      };
    });

    const procurementMap = await this.ordersRepository.getProcurementRulesBatch(
      procurementTriples,
      tx,
    );

    const priorityPairs = dedupeStrings(
      pairs.map((p) => `${sheetGroupId}_${p.productId}`),
    ).map((key) => {
      const [groupId, productId] = key.split('_');
      return { groupId: Number(groupId), productId: Number(productId) };
    });

    const priorityMap = await this.ordersRepository.getProductPrioritiesBatch(
      priorityPairs,
      tx,
    );

    const eligibleByPair = new Map<
      string,
      { distributorId: number; priority: number }[]
    >();
    const primaryDistributorByPair = new Map<string, number>();
    const linkCandidateKeys = new Set<string>();
    const linkCandidates: { distributorId: number; productId: number }[] = [];

    for (const { clientId, productId } of pairs) {
      const pairKey = `${clientId}_${productId}`;
      if (eligibleByPair.has(pairKey)) continue; // dedupe repeated pairs

      const product = productMap.get(productId)!;
      const category = categoryByProduct.get(productId)!;

      const primaryDistributorId = supplierMap.get(`${clientId}_${category}`);
      if (!primaryDistributorId) {
        throw new BadRequestException(
          `Missing ${category} supplier for client ${clientId}`,
        );
      }
      primaryDistributorByPair.set(pairKey, primaryDistributorId);

      const procurementKey = `${product.brand_id}_${category}_${product.product_group_id}`;
      const eligibleDistributorIds = procurementMap.get(procurementKey) ?? [];

      if (eligibleDistributorIds.length === 0) {
        throw new BadRequestException(
          `No eligible distributor found for product ${productId} in group ${sheetGroupId}`,
        );
      }

      const priorities =
        priorityMap.get(`${sheetGroupId}_${productId}`) ??
        new Map<number, number>();

      const eligible = eligibleDistributorIds
        .filter(
          (distributorId) =>
            distributorId === primaryDistributorId ||
            priorities.has(distributorId),
        )
        .map((distributorId) => ({
          distributorId,
          priority:
            distributorId === primaryDistributorId
              ? 0
              : priorities.get(distributorId)!,
        }))
        .sort((a, b) => a.priority - b.priority);

      eligibleByPair.set(pairKey, eligible);

      for (const candidate of eligible) {
        const linkKey = `${candidate.distributorId}_${productId}`;
        if (!linkCandidateKeys.has(linkKey)) {
          linkCandidateKeys.add(linkKey);
          linkCandidates.push({
            distributorId: candidate.distributorId,
            productId,
          });
        }
      }
    }

    const linkMap = await this.ordersRepository.getProductLinksForPairsBatch(
      linkCandidates,
      tx,
      true,
    );

    for (const { clientId, productId } of pairs) {
      const pairKey = `${clientId}_${productId}`;
      if (result.has(pairKey)) continue; // dedupe repeated pairs

      const product = productMap.get(productId)!;
      const eligible = eligibleByPair.get(pairKey)!;
      const primaryDistributorId = primaryDistributorByPair.get(pairKey)!;

      let selectedDistributorId: number | null = null;
      let productLinkId: number | null = null;
      let resolvedViaFallback = false;

      for (const candidate of eligible) {
        const link = linkMap.get(`${candidate.distributorId}_${productId}`);
        if (link) {
          if (candidate.distributorId !== primaryDistributorId) {
            resolvedViaFallback = true;
            this.logger.warn(
              `Product ${productId} in group ${sheetGroupId}: primary distributor ${primaryDistributorId} has no product link, falling back to distributor ${candidate.distributorId} (priority ${candidate.priority})`,
            );
          }
          selectedDistributorId = candidate.distributorId;
          productLinkId = link.id;
          break;
        }
      }

      if (!selectedDistributorId || !productLinkId) {
        throw new BadRequestException(
          `No product link found for any eligible distributor for product ${productId} in group ${sheetGroupId}`,
        );
      }

      result.set(pairKey, {
        distributorId: selectedDistributorId,
        productLinkId,
        gstPercentage: Number(product.gst_percentage ?? 0),
        gstInclusive: product.is_gst_inclusive,
        resolvedViaFallback,
      });
    }

    return result;
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
