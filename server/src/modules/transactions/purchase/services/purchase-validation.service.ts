import { BadRequestException, Injectable } from '@nestjs/common';

import { SavePurchaseDto } from '../dto/purchase.dto.js';

import { PurchaseRepository } from '../purchase.repository.js';

import { PURCHASE_ERROR_MESSAGES } from '../purchase.constants.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { buildPurchaseKey } from '../../../../common/utils/allocation-key.util.js';

@Injectable()
export class PurchaseValidationService {
  constructor(private readonly purchaseRepository: PurchaseRepository) {}

  async validatePurchases(
    paperId: number,
    dto: SavePurchaseDto,
    db: PrismaOrTransaction,
  ) {
    const products = await this.purchaseRepository.findProducts(db);

    const validProductIds = new Set(products.map((product) => product.id));

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(
        paperId,
        db,
      );

    if (allocations.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ALLOCATIONS,
      );
    }
    const validVehicles = new Set(
      allocations.map((allocation) => allocation.vehicle_id),
    );

    const allocationMap = new Map<string, number>();

    for (const allocation of allocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
        );
      }
      allocationMap.set(
  buildPurchaseKey({
    vehicleId: allocation.vehicle_id,
    distributorId: allocation.distributor_id,
    category: allocation.category,
    productId: allocation.product_id,
    deliverySession: allocation.vehicle_allocation_paper.delivery_session,
  }),
  Number(allocation.allocated_qty),
);
    }

    for (const entry of dto.entries) {
      if (entry.purchasedQty < 0) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.NEGATIVE_PURCHASE_QTY,
        );
      }

      if (entry.purchasedQty === 0) {
        continue;
      }

      if (!validProductIds.has(entry.productId)) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_PRODUCT(entry.productId),
        );
      }

      if (!validVehicles.has(entry.vehicleId)) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_VEHICLE(entry.vehicleId),
        );
      }

      const allocatedQty = allocationMap.get(
  buildPurchaseKey({
    vehicleId: entry.vehicleId,
    distributorId: entry.distributorId,
    category: entry.category,
    productId: entry.productId,
    deliverySession: entry.deliverySession,
  }),
);

      if (allocatedQty === undefined) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.ALLOCATION_NOT_FOUND(
            entry.vehicleId,
            entry.productId,
          ),
        );
      }

      if (entry.purchasedQty > allocatedQty) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.PURCHASE_EXCEEDS_ALLOCATION,
        );
      }
    }
  }

  async validatePurchasesComplete(paperId: number, db: PrismaOrTransaction) {
    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(
        paperId,
        db,
      );

    if (allocations.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ALLOCATIONS,
      );
    }

    const requiredAllocations = allocations.filter(
      (allocation) => Number(allocation.allocated_qty) > 0,
    );

    const purchasePaper = await this.purchaseRepository.findPurchasePaper(
      paperId,
      db,
    );

    if (!purchasePaper) {
      if (requiredAllocations.length === 0) {
        return;
      }

      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.PURCHASES_NOT_COMPLETED,
      );
    }

    const purchaseEntries = await this.purchaseRepository.findPurchaseEntries(
      purchasePaper.id,
      db,
    );

    const purchaseKeys = new Set(
  purchaseEntries.map((entry) => buildPurchaseKey(entry)),
);

    for (const allocation of requiredAllocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
        );
      }

      const key = buildPurchaseKey({
  vehicleId: allocation.vehicle_id,
  distributorId: allocation.distributor_id,
  category: allocation.category,
  productId: allocation.product_id,
  deliverySession: allocation.vehicle_allocation_paper.delivery_session,
});
if (!purchaseKeys.has(key)) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.PURCHASE_MISSING(
            allocation.vehicle_id,
            allocation.product_id,
          ),
        );
      }
    }
  }

  validateNoDuplicateEntries(entries: SavePurchaseDto['entries']): void {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const entry of entries) {
      const key = `${entry.vehicleId}_${entry.distributorId}_${entry.category}_${entry.productId}_${entry.deliverySession}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Duplicate purchase entries found: ${duplicates.join(', ')}. Each vehicle-distributor-category-product-session combination can only appear once.`,
      );
    }
  }
}
