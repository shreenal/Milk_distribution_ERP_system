import { Injectable, BadRequestException } from '@nestjs/common';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { VehicleAllocationValidationService } from './vehicle-allocation-validation.service.js';
import { AllocationSummaryBuilder } from '../../common/builders/allocation-summary.builder.js';
import { VEHICLE_ALLOCATION_ERROR_MESSAGES } from './vehicle-allocation.constants.js';
import {
  DeliverySession,
  SupplyCategory,
} from '../../generated/prisma/client.js';
import { OrderItemsRepository } from '../../common/repositories/order-items.repository.js';

@Injectable()
export class VehicleAllocationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,

    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,

    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,

    private readonly orderItemsRepository: OrderItemsRepository,

    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,

    private readonly workflowState: WorkflowStateService,
  ) {}

  private async getGroupSummary(paperId: number, session: DeliverySession) {
    const orderItems =
      await this.orderItemsRepository.findOrderItemsWithSupplyContextByPaperId(
        paperId,
      );

    return this.allocationSummaryBuilder.build(orderItems, session);
  }

  async getVehicleAllocations(paperId: number) {
    const paper =
      await this.vehicleAllocationRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    const session = this.workflowState.getActiveExecutionSession(paper.status);

    const summaries = await this.getGroupSummary(paperId, session);

    const vehicles = await this.vehicleAllocationRepository.findVehicles();

    const distributors =
      await this.vehicleAllocationRepository.findDistributors();

    const assignmentGrid =
      this.vehicleAllocationBuilder.buildVehicleAssignmentGrid(
        vehicles,

        distributors,
      );

    const allocationGrids =
      this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
        summaries,
        vehicles,
      );

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaper(
        paperId,
        session,
      );

    if (!vehicleAllocationPaper) {
      return {
        ...allocationGrids,

        vehicleAssignments: assignmentGrid,
      };
    }

    const savedAllocations =
      await this.vehicleAllocationRepository.findVehicleAllocations(
        vehicleAllocationPaper.id,
      );

    const savedAssignments =
      await this.vehicleAllocationRepository.findVehicleAssignments(
        vehicleAllocationPaper.id,
      );

    const allocationResult =
      this.vehicleAllocationBuilder.applyVehicleAllocations(
        allocationGrids,

        savedAllocations,
      );

    const assignmentResult =
      this.vehicleAllocationBuilder.applyVehicleAssignments(
        assignmentGrid,

        savedAssignments,
      );

    return {
      ...allocationResult,

      vehicleAssignments: assignmentResult,
    };
  }

  async saveVehicleAllocations(paperId: number, dto: SaveVehicleAllocationDto) {
    const paper =
      await this.vehicleAllocationRepository.findOrderPaperById(paperId);
    if (!paper) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    const status = paper.status;
    const session = this.workflowState.getActiveExecutionSession(status);

    if (!this.workflowState.canEditVehicleAllocations(status, session)) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.EDIT_NOT_ALLOWED,
      );
    }

    await this.vehicleAllocationValidationService.validateVehicleAssignments(
      paperId,
      dto,
    );

    await this.vehicleAllocationValidationService.validateAllocationProductLinks(
      dto,
    );

    await this.vehicleAllocationValidationService.validateVehicleAllocations(
      paperId,
      dto,
    );

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.getOrCreateVehicleAllocationPaper(
        paperId,
        session,
      );

    const assignmentRows = dto.assignments.flatMap((assignment) => {
      const rows: {
        vehicle_allocation_paper_id: number;
        vehicle_id: number;
        category: SupplyCategory;
        distributor_id: number;
      }[] = [];

      if (assignment.milkDistributorId) {
        rows.push({
          vehicle_allocation_paper_id: vehicleAllocationPaper.id,
          vehicle_id: assignment.vehicleId,
          category: SupplyCategory.MILK,
          distributor_id: assignment.milkDistributorId,
        });
      }

      if (assignment.nonMilkDistributorId) {
        rows.push({
          vehicle_allocation_paper_id: vehicleAllocationPaper.id,
          vehicle_id: assignment.vehicleId,
          category: SupplyCategory.NON_MILK,
          distributor_id: assignment.nonMilkDistributorId,
        });
      }

      return rows;
    });

    await this.vehicleAllocationRepository.replaceVehicleAssignments(
      vehicleAllocationPaper.id,
      assignmentRows,
    );

    const allocations = dto.allocations.filter(
      (allocation) => allocation.allocatedQty > 0,
    );

    // ✓ Now safe to save - product links validated above
    await this.vehicleAllocationRepository.replaceVehicleAllocations(
      vehicleAllocationPaper.id,
      allocations.map((allocation) => ({
        vehicle_allocation_paper_id: vehicleAllocationPaper.id,
        vehicle_id: allocation.vehicleId,
        distributor_id: allocation.distributorId,
        category: allocation.category,
        product_id: allocation.productId,
        allocated_qty: allocation.allocatedQty,
      })),
    );

    return this.getVehicleAllocations(paperId);
  }
}
