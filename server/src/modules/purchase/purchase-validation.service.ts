import { BadRequestException, Injectable } from '@nestjs/common';

import { SavePurchaseDto } from './dto/purchase.dto.js';

import { PurchaseRepository } from './purchase.repository.js';

import {
  VehicleAssignment,
  ProcurementRule,
} from '../../types/purchase.types.js';

import { PURCHASE_ERROR_MESSAGES } from './purchase.constants.js';

@Injectable()
export class PurchaseValidationService {
  constructor(private readonly purchaseRepository: PurchaseRepository) {}

  async validatePurchases(paperId: number, dto: SavePurchaseDto) {
    const products = await this.purchaseRepository.findProducts();

    const vehicleAssignments: VehicleAssignment[] =
      await this.purchaseRepository.findVehicleAssignmentsByPaperId(paperId);

    const procurementRules: ProcurementRule[] =
      await this.purchaseRepository.findDistributorProcurementRules();

    const validProductIds = new Set(products.map((product) => product.id));

    const validVehicles = new Set(
      vehicleAssignments.map((assignment) => assignment.vehicle_id),
    );

    const validDistributors = new Set(
      procurementRules.map((rule) => rule.distributor_id),
    );

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    const vehicleDistributorMap = new Map<number, number>();

    for (const assignment of vehicleAssignments) {
      vehicleDistributorMap.set(
        assignment.vehicle_id,

        assignment.distributor_id,
      );
    }

    const allocationMap = new Map<string, number>();

    for (const allocation of allocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
        );
      }
      allocationMap.set(
        `${allocation.vehicle_id}_${allocation.product_id}`,

        Number(allocation.allocated_qty),
      );
    }

    const productsByBrandAndGroup = new Map<string, typeof products>();

    for (const product of products) {
      const key = `${product.brand_id}_${product.product_group_id}`;

      const existing = productsByBrandAndGroup.get(key) ?? [];

      existing.push(product);

      productsByBrandAndGroup.set(key, existing);
    }
    const validProcurementRules = new Set<string>();

    for (const rule of procurementRules) {
      const matchingProducts =
        productsByBrandAndGroup.get(
          `${rule.brand_id}_${rule.product_group_id}`,
        ) ?? [];

      for (const product of matchingProducts) {
        validProcurementRules.add(`${rule.distributor_id}_${product.id}`);
      }
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

      if (!validDistributors.has(entry.distributorId)) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_DISTRIBUTOR(entry.distributorId),
        );
      }

      const assignedDistributor = vehicleDistributorMap.get(entry.vehicleId);

      if (assignedDistributor !== entry.distributorId) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.VEHICLE_DISTRIBUTOR_MISMATCH(
            entry.vehicleId,
            entry.distributorId,
          ),
        );
      }

      if (
        !validProcurementRules.has(`${entry.distributorId}_${entry.productId}`)
      ) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.PROCUREMENT_RULE_MISSING(
            entry.distributorId,
            entry.productId,
          ),
        );
      }

      const allocatedQty = allocationMap.get(
        `${entry.vehicleId}_${entry.productId}`,
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

  async validatePurchasesComplete(paperId: number) {
    const purchasePaper =
      await this.purchaseRepository.findPurchasePaperByOrderPaperId(paperId);

    if (!purchasePaper) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.PURCHASES_NOT_COMPLETED,
      );
    }

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    const purchaseEntries = await this.purchaseRepository.findPurchaseEntries(
      purchasePaper.id,
    );

    const purchaseKeys = new Set(
      purchaseEntries.map((entry) => `${entry.vehicle_id}_${entry.product_id}`),
    );

    if (allocations.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ALLOCATIONS,
      );
    }

    for (const allocation of allocations) {
      const key = `${allocation.vehicle_id}_${allocation.product_id}`;

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
}
