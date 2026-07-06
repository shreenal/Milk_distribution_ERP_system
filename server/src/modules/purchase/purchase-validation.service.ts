import { BadRequestException, Injectable } from '@nestjs/common';

import { SavePurchaseDto } from './dto/purchase.dto.js';

import { PurchaseRepository } from './purchase.repository.js';

import { SupplyCategory } from '../../generated/prisma/client.js';

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

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    const assignmentMap = new Map<string, VehicleAssignment>();

    for (const assignment of vehicleAssignments) {
      assignmentMap.set(
        `${assignment.vehicle_id}_${assignment.category}`,
        assignment,
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
        `${allocation.vehicle_id}_${allocation.distributor_id}_${allocation.category}_${allocation.product_id}`,
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
        validProcurementRules.add(
          `${rule.distributor_id}_${rule.category}_${product.id}`,
        );
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

      const assignment = assignmentMap.get(
        `${entry.vehicleId}_${entry.category}`,
      );

      if (!assignment || assignment.distributor_id !== entry.distributorId) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(entry.vehicleId),
        );
      }

      if (
        !validProcurementRules.has(
          `${entry.distributorId}_${entry.category}_${entry.productId}`,
        )
      ) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.PROCUREMENT_RULE_MISSING(
            entry.distributorId,
            entry.productId,
          ),
        );
      }

      const allocatedQty = allocationMap.get(
        `${entry.vehicleId}_${entry.distributorId}_${entry.category}_${entry.productId}`,
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
    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    if (allocations.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ALLOCATIONS,
      );
    }

    const requiredAllocations = allocations.filter(
      (allocation) => Number(allocation.allocated_qty) > 0,
    );

    const vehicleAssignments: VehicleAssignment[] =
      await this.purchaseRepository.findVehicleAssignmentsByPaperId(paperId);

    const assignmentMap = new Map<string, VehicleAssignment>();

    for (const assignment of vehicleAssignments) {
      assignmentMap.set(
        `${assignment.vehicle_id}_${assignment.category}`,
        assignment,
      );
    }

    const purchasePaper =
      await this.purchaseRepository.findPurchasePaperByOrderPaperId(paperId);

    console.log('purchasePaper =', purchasePaper);
    if (!purchasePaper) {
      console.log('purchasePaper is null -> throwing PURCHASES_NOT_COMPLETED');
      if (requiredAllocations.length === 0) {
        return;
      }

      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.PURCHASES_NOT_COMPLETED,
      );
    }

    const purchaseEntries = await this.purchaseRepository.findPurchaseEntries(
      purchasePaper.id,
    );

    const purchaseKeys = new Set(
      purchaseEntries.map(
        (entry) =>
          `${entry.distributor_id}_${entry.category}_${entry.vehicle_id}_${entry.product_id}`,
      ),
    );

    for (const allocation of requiredAllocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
        );
      }

      const assignment = assignmentMap.get(
        `${allocation.vehicle_id}_${allocation.category}`,
      );

      if (
        !assignment ||
        assignment.distributor_id !== allocation.distributor_id
      ) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(
            allocation.vehicle_id,
          ),
        );
      }

      const key = `${allocation.distributor_id}_${allocation.category}_${allocation.vehicle_id}_${allocation.product_id}`;

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
