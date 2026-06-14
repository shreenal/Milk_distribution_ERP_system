import { BadRequestException, Injectable } from '@nestjs/common';

import { PurchaseRepository } from './purchase.repository.js';

import { PurchaseBuilder } from './purchase.builder.js';
import { SavePurchaseDto } from './dto/purchase.dto.js';
import { PurchaseValidationService } from './purchase-validation.service.js';
import {
  PaperStatus,
  WorkflowStateService,
} from '../workflow/workflow-state.service.js';
import {
  VehicleAssignment,
  ProcurementRule,
} from '../../types/purchase.types.js';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly purchaseRepository: PurchaseRepository,

    private readonly purchaseBuilder: PurchaseBuilder,

    private readonly purchaseValidationService: PurchaseValidationService,

    private readonly workflowState: WorkflowStateService,
  ) {}

  async getPurchases(paperId: number) {
    const paper = await this.purchaseRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException('Order paper not found');
    }

    const vehicleAllocationPaper =
      await this.purchaseRepository.findVehicleAllocationPaperByOrderPaperId(
        paperId,
      );

    if (!vehicleAllocationPaper) {
      throw new BadRequestException(
        'Vehicle allocations must be completed before purchasing',
      );
    }
    const vehicleAssignments: VehicleAssignment[] =
      await this.purchaseRepository.findVehicleAssignmentsByPaperId(paperId);

    if (vehicleAssignments.length === 0) {
      throw new BadRequestException('No vehicle assignments found');
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

    const purchasePaper =
      await this.purchaseRepository.findPurchasePaperByOrderPaperId(paperId);

    const distributorRates =
      await this.purchaseRepository.findDistributorProductRates();

    const rateResult = this.purchaseBuilder.applyDistributorRates(
      allocationResult,
      distributorRates,
    );

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
      throw new BadRequestException('Order paper not found');
    }

    if (!this.workflowState.canEditPurchases(paper.status as PaperStatus)) {
      throw new BadRequestException(
        'Purchases cannot be edited in current workflow state',
      );
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

    const distributorRates =
      await this.purchaseRepository.findDistributorProductRates();

    const allocationMap = new Map<string, (typeof allocations)[number]>();

    for (const allocation of allocations) {
      allocationMap.set(
        `${allocation.vehicle_id}_${allocation.product_id}`,

        allocation,
      );
    }

    const rateMap = new Map<string, (typeof distributorRates)[number]>();

    for (const rate of distributorRates) {
      rateMap.set(
        `${rate.distributor_id}_${rate.product_id}`,

        rate,
      );
    }

    await this.purchaseRepository.replacePurchaseEntries(
      purchasePaper.id,

      entries.map((entry) => {
        const allocation = allocationMap.get(
          `${entry.vehicleId}_${entry.productId}`,
        );

        const rate = rateMap.get(`${entry.distributorId}_${entry.productId}`);

        if (!allocation) {
          throw new BadRequestException(
            `Allocation not found for vehicle ${entry.vehicleId} product ${entry.productId}`,
          );
        }

        if (!rate) {
          throw new BadRequestException(
            `Rate not found for distributor ${entry.distributorId} product ${entry.productId}`,
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
        };
      }),
    );

    return this.getPurchases(paperId);
  }
}
