import { Injectable, BadRequestException } from '@nestjs/common';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { VehicleAllocationValidationService } from './vehicle-allocation-validation.service.js';

@Injectable()
export class VehicleAllocationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,

    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,

    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,

    private readonly workflowState: WorkflowStateService,
  ) {}

  async getGroupSummary(paperId: number) {
    const paper =
      await this.vehicleAllocationRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException('Order paper not found');
    }

    const sheets =
      await this.vehicleAllocationRepository.findOrderSheetsByPaperId(paperId);

    const sheetItems =
      await this.vehicleAllocationRepository.findSheetItemsByPaperId(paperId);

    const products = await this.vehicleAllocationRepository.findProducts();

    return this.vehicleAllocationBuilder.buildGroupSummary(
      sheets,

      sheetItems,

      products,
    );
  }

  async getVehicleAllocations(paperId: number) {
    const groupSummary = await this.getGroupSummary(paperId);

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
        groupSummary.summaries,

        vehicles,
      );

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaperByOrderPaperId(
        paperId,
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
      throw new BadRequestException('Order paper not found');
    }

    const status = paper.status;

    if (!this.workflowState.canEditVehicleAllocations(status as any)) {
      throw new BadRequestException(
        'Vehicle allocations cannot be edited in current workflow state',
      );
    }
    await this.vehicleAllocationValidationService.validateVehicleAllocations(
      paperId,
      dto,
    );

    await this.vehicleAllocationValidationService.validateVehicleAssignments(
      paperId,
      dto,
    );

    let vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaperByOrderPaperId(
        paperId,
      );

    if (!vehicleAllocationPaper) {
      vehicleAllocationPaper =
        await this.vehicleAllocationRepository.createVehicleAllocationPaper(
          paperId,
        );
    }

    const allocations = dto.allocations.filter(
      (allocation) => allocation.allocatedQty > 0,
    );

    await this.vehicleAllocationRepository.replaceVehicleAllocations(
      vehicleAllocationPaper.id,

      allocations.map((allocation) => ({
        vehicle_allocation_paper_id: vehicleAllocationPaper.id,

        vehicle_id: allocation.vehicleId,

        product_id: allocation.productId,

        allocated_qty: allocation.allocatedQty,
      })),
    );

    const assignments = dto.assignments.filter(
      (assignment) => assignment.distributorId,
    );

    await this.vehicleAllocationRepository.replaceVehicleAssignments(
      vehicleAllocationPaper.id,

      assignments.map((assignment) => ({
        vehicle_allocation_paper_id: vehicleAllocationPaper.id,

        vehicle_id: assignment.vehicleId,

        distributor_id: assignment.distributorId,
      })),
    );

    return this.getVehicleAllocations(paperId);
  }
}
