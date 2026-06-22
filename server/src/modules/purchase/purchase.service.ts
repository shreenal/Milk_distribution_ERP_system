import { BadRequestException, Injectable } from '@nestjs/common';

import { PurchaseRepository } from './purchase.repository.js';

import { PurchaseBuilder } from './purchase.builder.js';
import { SavePurchaseDto } from './dto/purchase.dto.js';
import { PurchaseValidationService } from './purchase-validation.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import {
  VehicleAssignment,
  ProcurementRule,
} from '../../types/purchase.types.js';
import { PURCHASE_ERROR_MESSAGES } from './purchase.constants.js';

import { GatepassDatePolicy } from '../../generated/prisma/client.js'

@Injectable()
export class PurchaseService {
  constructor(
    private readonly purchaseRepository: PurchaseRepository,

    private readonly purchaseBuilder: PurchaseBuilder,

    private readonly purchaseValidationService: PurchaseValidationService,

    private readonly workflowState: WorkflowStateService,
  ) { }

  async getPurchases(paperId: number) {
    const paper = await this.purchaseRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    const vehicleAllocationPaper =
      await this.purchaseRepository.findVehicleAllocationPaperByOrderPaperId(
        paperId,
      );

    if (!vehicleAllocationPaper) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.VEHICLE_ALLOCATIONS_REQUIRED,
      );
    }

    const vehicleAssignments: VehicleAssignment[] =
      await this.purchaseRepository.findVehicleAssignmentsByPaperId(paperId);

    if (vehicleAssignments.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ASSIGNMENTS,
      );
    }

    const products = await this.purchaseRepository.findProducts();

    const procurementRules: ProcurementRule[] =
      await this.purchaseRepository.findDistributorProcurementRules();

    const grids = this.purchaseBuilder.buildPurchaseGrids(
      procurementRules,
      products,
      vehicleAssignments,
    );

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    const allocationResult = this.purchaseBuilder.applyVehicleAllocations(
      grids,
      allocations,
    );

    const rateDefaults = await Promise.all(
      allocations.map(async (allocation) => {
        if (allocation.vehicle_id == null || allocation.product_id == null) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
          );
        }

        const assignment = vehicleAssignments.find(
          (vehicleAssignment) =>
            vehicleAssignment.vehicle_id === allocation.vehicle_id,
        );

        if (!assignment) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(
              allocation.vehicle_id
            ),
          );
        }

        const gatepassDate = resolveGatepassDate(
          paper.sale_date,
          allocation.master_product.master_brand.gatepass_date_policy,
        );

        const rate =
          await this.purchaseRepository.findDistributorProductRateForDate(
            assignment.distributor_id,
            allocation.product_id,
            gatepassDate,
          );

        if (!rate) {
          throw new BadRequestException(
            `Rate not found for distributor ${assignment.distributor_id} product ${allocation.product_id} on ${gatepassDate.toISOString().slice(0, 10)}`,
          );
        }

        return {
          distributorId: assignment.distributor_id,
          vehicleId: allocation.vehicle_id,
          productId: allocation.product_id,
          purchaseRate: Number(rate.purchase_rate),
        };
      }),
    );

    const rateResult = this.purchaseBuilder.applyPurchaseRates(
      allocationResult,
      rateDefaults,
    );

    const purchasePaper =
      await this.purchaseRepository.findPurchasePaperByOrderPaperId(paperId);

    if (!purchasePaper) {
      return rateResult;
    }

    const purchaseEntries = await this.purchaseRepository.findPurchaseEntries(
      purchasePaper.id,
    );

    return this.purchaseBuilder.applyPurchaseEntries(
      rateResult,
      purchaseEntries,
    );
  }

  async savePurchases(paperId: number, dto: SavePurchaseDto) {
    const paper = await this.purchaseRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    if (!this.workflowState.canEditPurchases(paper.status)) {
      throw new BadRequestException(PURCHASE_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    }

    await this.purchaseValidationService.validatePurchases(paperId, dto);

    const entries = dto.entries.filter((entry) => entry.purchasedQty > 0);

    let purchasePaper =
      await this.purchaseRepository.findPurchasePaperByOrderPaperId(paperId);

    if (!purchasePaper) {
      purchasePaper =
        await this.purchaseRepository.createPurchasePaper(paperId);
    }

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    const allocationMap = new Map<string, (typeof allocations)[number]>();

    for (const allocation of allocations) {
      if (allocation.vehicle_id == null || allocation.product_id == null) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
        );
      }

      allocationMap.set(
        `${allocation.vehicle_id}_${allocation.product_id}`,
        allocation,
      );
    }

    const purchaseRows = await Promise.all(
      entries.map(async (entry) => {
        const allocation = allocationMap.get(
          `${entry.vehicleId}_${entry.productId}`,
        );

        if (!allocation) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.ALLOCATION_NOT_FOUND(
              entry.vehicleId,
              entry.productId,
            ),
          );
        }

        const gatepassDate = resolveGatepassDate(
          paper.sale_date,
          allocation.master_product.master_brand.gatepass_date_policy,
        );

        const rate =
          await this.purchaseRepository.findDistributorProductRateForDate(
            entry.distributorId,
            entry.productId,
            gatepassDate,
          );

        if (!rate) {
          throw new BadRequestException(
            `Rate not found for distributor ${entry.distributorId} product ${entry.productId} on ${gatepassDate.toISOString().slice(0, 10)}`,
          );
        }

        return {
          purchase_paper_id: purchasePaper.id,
          distributor_id: entry.distributorId,
          vehicle_id: entry.vehicleId,
          product_id: entry.productId,
          allocated_qty: allocation.allocated_qty,
          purchased_qty: entry.purchasedQty,
          purchase_rate: rate.purchase_rate,
          purchase_amount:
            Number(entry.purchasedQty) * Number(rate.purchase_rate),
          gatepass_date: gatepassDate,
        };
      }),
    );

    await this.purchaseRepository.replacePurchaseEntries(
      purchasePaper.id,
      purchaseRows,
    );

    return this.getPurchases(paperId);
  }
}

function resolveGatepassDate(
  saleDate: Date,
  policy: GatepassDatePolicy,
): Date {
  const gatepassDate = new Date(saleDate);

  if (policy === GatepassDatePolicy.PREVIOUS_DAY) {
    gatepassDate.setDate(gatepassDate.getDate() - 1);
  }

  return gatepassDate;
}