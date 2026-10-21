import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, SupplyCategory } from '../../../../generated/prisma/client.js';
import { OrdersRepository } from '../orders.repository.js';

export interface CommercialContext {
  distributorId: number;
  productLinkId: number;
  resolvedViaFallback: boolean;
}

@Injectable()
export class OrderCommercialService {
  private readonly logger = new Logger(OrderCommercialService.name);
  constructor(private readonly ordersRepository: OrdersRepository) {}

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

    const clientCategoryPairs = uniqueBy(
      pairs.map((p) => ({
        clientId: p.clientId,
        category: categoryByProduct.get(p.productId)!,
      })),
      (x) => `${x.clientId}_${x.category}`,
    );

    const supplierMap =
      await this.ordersRepository.getClientCategorySuppliersBatch(
        clientCategoryPairs,
        tx,
      );

    const procurementTriples = uniqueBy(
      pairs.map((p) => {
        const product = productMap.get(p.productId)!;
        return {
          brandId: product.brand_id,
          category: categoryByProduct.get(p.productId)!,
          productGroupId: product.product_group_id,
        };
      }),
      (t) => `${t.brandId}_${t.category}_${t.productGroupId}`,
    );

    const procurementMap = await this.ordersRepository.getProcurementRulesBatch(
      procurementTriples,
      tx,
    );

    const priorityPairs = uniqueBy(
      pairs.map((p) => ({ groupId: sheetGroupId, productId: p.productId })),
      (x) => `${x.groupId}_${x.productId}`,
    );

    const priorityMap = await this.ordersRepository.getProductPrioritiesBatch(
      priorityPairs,
      tx,
    );

    const eligibleByPair = new Map<
      string,
      { distributorId: number; priority: number }[]
    >();
    const primaryDistributorByPair = new Map<string, number | null>();
    const linkCandidateKeys = new Set<string>();
    const linkCandidates: { distributorId: number; productId: number }[] = [];

    for (const { clientId, productId } of pairs) {
      const pairKey = `${clientId}_${productId}`;
      if (eligibleByPair.has(pairKey)) continue; // dedupe repeated pairs

      const product = productMap.get(productId)!;
      const category = categoryByProduct.get(productId)!;

      const primaryDistributorId =
        supplierMap.get(`${clientId}_${category}`) ?? null;
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

      if (eligible.length === 0) {
        throw new BadRequestException(
          `No eligible supplier (primary or fallback) can supply product ${productId} for client ${clientId} in group ${sheetGroupId}`,
        );
      }
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
        resolvedViaFallback,
      });
    }

    return result;
  }
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  return [...new Map(items.map((i) => [key(i), i])).values()];
}
