import { BadRequestException, Injectable } from '@nestjs/common';

import { PurchaseRepository } from './purchase.repository.js';

import { PurchaseBuilder } from './purchase.builder.js';
import { SavePurchaseDto } from './dto/purchase.dto.js';
import { PurchaseValidationService } from './services/purchase-validation.service.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';

import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import { VehicleAssignment } from '../../../types/purchase.types.js';
import { PURCHASE_ERROR_MESSAGES } from './purchase.constants.js';

import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PurchaseCommercialService } from './services/purchase-commercial.service.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly purchaseRepository: PurchaseRepository,

    private readonly purchaseBuilder: PurchaseBuilder,

    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,

    private readonly orderItemsRepository: OrderItemsRepository,

    private readonly purchaseValidationService: PurchaseValidationService,

    private readonly purchaseBillingService: PurchaseBillingService,

    private readonly purchaseCommercialService: PurchaseCommercialService,

    private readonly workflowState: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,

    private readonly prisma: PrismaService,

    private readonly dependencyOrchestrator: DependencyOrchestratorService,
  ) {}

  async getPurchases(paperId: number) {
    const paper = await this.purchaseRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    const vehicleAssignments: VehicleAssignment[] =
      await this.purchaseRepository.findVehicleAssignmentsByPaperId(paperId);

    if (vehicleAssignments.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ASSIGNMENTS,
      );
    }

    const assignmentMap = buildVehicleAssignmentMap(vehicleAssignments);

    const workflow = this.workflowBuilder.buildPurchasesWorkflow(paper.status);

    const orderItems =
      await this.orderItemsRepository.findOrderItemsWithSupplyContextByPaperId(
        paperId,
      );

    const summaries = this.allocationSummaryBuilder.build(orderItems);

    const grids = this.purchaseBuilder.buildPurchaseGrids(
      summaries,
      vehicleAssignments,
    );

    const allocations =
      await this.purchaseRepository.findVehicleAllocationsByPaperId(paperId);

    if (allocations.length === 0) {
      throw new BadRequestException(
        PURCHASE_ERROR_MESSAGES.VEHICLE_ALLOCATIONS_REQUIRED,
      );
    }

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

        const key = `${allocation.vehicle_id}_${allocation.category}_${allocation.vehicle_allocation_paper.delivery_session}`;

        const assignment = assignmentMap.get(key);

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

        const commercial = await this.purchaseCommercialService.resolve(
          paper.sale_date,
          allocation.distributor_id,
          allocation.product_id,
          allocation.master_product.master_brand.gatepass_date_policy,
        );

        return {
          distributorId: allocation.distributor_id,
          category: allocation.category,
          vehicleId: allocation.vehicle_id,
          deliverySession: allocation.vehicle_allocation_paper.delivery_session,
          productId: allocation.product_id,
          purchaseRate: commercial.purchaseRate,
        };
      }),
    );

    const rateResult = this.purchaseBuilder.applyPurchaseRates(
      allocationResult,
      rateDefaults,
    );

    const purchasePaper =
      await this.purchaseRepository.findPurchasePaper(paperId);

    if (!purchasePaper) {
      return {
        paper,
        workflow,
        ...rateResult,
      };
    }

    const purchaseEntries = await this.purchaseRepository.findPurchaseEntries(
      purchasePaper.id,
    );

    const acknowledgements =
      await this.purchaseRepository.findVarianceAcknowledgements(
        purchasePaper.id,
      );

    const purchases = this.purchaseBuilder.applyPurchaseEntries(
      rateResult,
      purchaseEntries,
    );

    const purchasesWithVariance = this.purchaseBuilder.applyVarianceMetadata(
      purchases,
      allocations,
      purchaseEntries,
      acknowledgements,
    );

    return {
      paper,
      workflow,
      ...purchasesWithVariance,
    };
  }

  async savePurchases(paperId: number, dto: SavePurchaseDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const paper = await this.purchaseRepository.findOrderPaperById(
        paperId,
        tx,
      );

      if (!paper) {
        throw new BadRequestException(
          PURCHASE_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
        );
      }

      const status = paper.status;

      if (!this.workflowState.canEditPurchases(status)) {
        throw new BadRequestException(PURCHASE_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
      }

      await this.purchaseValidationService.validatePurchases(paperId, dto, tx);

      const entries = dto.entries.filter((entry) => entry.purchasedQty > 0);

      const purchasePaper =
        await this.purchaseRepository.getOrCreatePurchasePaper(paperId, tx);

      const allocations =
        await this.purchaseRepository.findVehicleAllocationsByPaperId(
          paperId,
          tx,
        );

      const vehicleAssignments: VehicleAssignment[] =
        await this.purchaseRepository.findVehicleAssignmentsByPaperId(
          paperId,
          tx,
        );

      const assignmentMap = buildVehicleAssignmentMap(vehicleAssignments);

      const allocationMap = new Map<string, (typeof allocations)[number]>();

      for (const allocation of allocations) {
        if (allocation.vehicle_id == null || allocation.product_id == null) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
          );
        }

        allocationMap.set(
          `${allocation.vehicle_id}_${allocation.distributor_id}_${allocation.category}_${allocation.product_id}_${allocation.vehicle_allocation_paper.delivery_session}`,
          allocation,
        );
      }

      const purchaseRows = await Promise.all(
        entries.map(async (entry) => {
          const allocation = allocationMap.get(
            `${entry.vehicleId}_${entry.distributorId}_${entry.category}_${entry.productId}_${entry.deliverySession}`,
          );

          if (!allocation) {
            throw new BadRequestException(
              PURCHASE_ERROR_MESSAGES.ALLOCATION_NOT_FOUND(
                entry.vehicleId,
                entry.productId,
              ),
            );
          }

          const assignment = assignmentMap.get(
            `${entry.vehicleId}_${entry.category}_${entry.deliverySession}`,
          );

          if (
            !assignment ||
            assignment.distributor_id !== entry.distributorId
          ) {
            throw new BadRequestException(
              PURCHASE_ERROR_MESSAGES.VEHICLE_ASSIGNMENT_NOT_FOUND(
                entry.vehicleId,
              ),
            );
          }

          const commercial = await this.purchaseCommercialService.resolve(
            paper.sale_date,
            entry.distributorId,
            entry.productId,
            allocation.master_product.master_brand.gatepass_date_policy,
            tx,
          );

          const { purchaseAmount } = this.purchaseBillingService.calculate(
            Number(entry.purchasedQty),
            Number(commercial.purchaseRate),
          );

          return {
            purchase_paper_id: purchasePaper.id,
            delivery_session: entry.deliverySession,
            distributor_id: entry.distributorId,
            category: entry.category,
            vehicle_id: entry.vehicleId,
            product_id: entry.productId,
            product_link_id: commercial.productLinkId,
            purchased_qty: entry.purchasedQty,
            purchase_rate: commercial.purchaseRate,
            purchase_amount: purchaseAmount,
            gatepass_date: commercial.gatepassDate,
          };
        }),
      );

      await this.purchaseRepository.replacePurchaseEntries(
        purchasePaper.id,
        purchaseRows,
        tx,
      );

      await this.dependencyOrchestrator.execute(
        DEPENDENCY_MODULES.PURCHASE,
        DEPENDENCY_TRIGGERS.ON_SAVE,
        {
          paperId,
          tx,
        },
      );

      const savedEntries = await this.purchaseRepository.findPurchaseEntries(
        purchasePaper.id,
        tx,
      );

      const purchaseEntryMap = new Map<string, (typeof savedEntries)[number]>();

      for (const entry of savedEntries) {
        purchaseEntryMap.set(
          `${entry.vehicle_id}_${entry.distributor_id}_${entry.category}_${entry.product_id}_${entry.delivery_session}`,
          entry,
        );
      }

      for (const acknowledgement of dto.acknowledgements ?? []) {
        const purchaseEntry = purchaseEntryMap.get(
          `${acknowledgement.vehicleId}_${acknowledgement.distributorId}_${acknowledgement.category}_${acknowledgement.productId}_${acknowledgement.deliverySession}`,
        );

        if (!purchaseEntry) {
          continue;
        }

        await this.purchaseRepository.upsertVarianceAcknowledgement(
          purchaseEntry.id,
          userId,
          acknowledgement.reason,
          acknowledgement.remarks ?? null,
          tx,
        );
      }

      return {
        success: true,
      };
    });
  }
}

function buildVehicleAssignmentMap(
  assignments: VehicleAssignment[],
): Map<string, VehicleAssignment> {
  const map = new Map<string, VehicleAssignment>();

  for (const assignment of assignments) {
    map.set(
      `${assignment.vehicle_id}_${assignment.category}_${assignment.vehicle_allocation_paper.delivery_session}`,
      assignment,
    );
  }

  return map;
}
