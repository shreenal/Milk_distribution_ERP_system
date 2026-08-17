import { Injectable, BadRequestException } from '@nestjs/common';
import { SaveVehicleAllocationDto } from '../dto/save-vehicle-allocation.dto.js';
import { VehicleAllocationRepository } from '../vehicle-allocation.repository.js';
import { VehicleAllocationBuilder } from '../vehicle-allocation.builder.js';
import { VEHICLE_ALLOCATION_ERROR_MESSAGES } from '../vehicle-allocation.constants.js';
import { AllocationSummaryBuilder } from '../../../../common/builders/allocation-summary.builder.js';
import { WorkflowStateService } from '../../workflow/workflow-state.service.js';
import {
  DeliverySession,
  SupplyCategory,
} from '../../../../generated/prisma/client.js';
import { OrderItemsRepository } from '../../../../common/repositories/order-items.repository.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';

@Injectable()
export class VehicleAllocationValidationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,
    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,
    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly workflowState: WorkflowStateService,
  ) {}

  async validateVehicleAllocations(
    paperId: number,
    dto: SaveVehicleAllocationDto,
    db: PrismaOrTransaction,
  ) {
    const vehicles = await this.vehicleAllocationRepository.findVehicles(db);

    const paper = await this.vehicleAllocationRepository.findOrderPaperById(
      paperId,
      db,
    );

    if (!paper) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    const session = this.workflowState.getActiveExecutionSession(paper.status);

    const summaries = await this.getGroupSummary(paperId, session, db);

    // rest unchanged
  }

  async validateVehicleAllocationsForNightSubmit(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const allocationGrid = await this.getAllocationGrid(
      paperId,
      DeliverySession.NIGHT,
      db,
    );

    for (const allocation of allocationGrid.allocations) {
      for (const [field, requiredQty] of Object.entries(allocation.totals)) {
        let allocatedQty = 0;

        for (const row of allocation.rows) {
          allocatedQty += Number(row[field] ?? 0);
        }

        if (allocatedQty !== Number(requiredQty)) {
          throw new BadRequestException(
            `${allocation.brand.name} ${field} allocation mismatch. Required: ${requiredQty}, Allocated: ${allocatedQty}`,
          );
        }
      }
    }
  }

  private async getGroupSummary(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction,
  ) {
    const orderItems =
      await this.orderItemsRepository.findOrderItemsWithSupplyContextByPaperId(
        paperId,
        db,
      );

    const summaries = this.allocationSummaryBuilder.build(orderItems, session);

    return summaries;
  }

  private async getAllocationGrid(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction,
  ) {
    const summaries = await this.getGroupSummary(paperId, session, db);

    const vehicles = await this.vehicleAllocationRepository.findVehicles(db);

    const allocationGrids =
      this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
        summaries,
        vehicles,
      );

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaper(
        paperId,
        session,
        db,
      );

    if (!vehicleAllocationPaper) {
      return allocationGrids;
    }

    const savedAllocations =
      await this.vehicleAllocationRepository.findVehicleAllocations(
        vehicleAllocationPaper.id,
        db,
      );

    return this.vehicleAllocationBuilder.applyVehicleAllocations(
      allocationGrids,

      savedAllocations,
    );
  }

  async validateVehicleAssignments(
    paperId: number,
    dto: SaveVehicleAllocationDto,
    db: PrismaOrTransaction,
  ) {
    const vehicles = await this.vehicleAllocationRepository.findVehicles(db);
    const distributors =
      await this.vehicleAllocationRepository.findDistributors(db);
    const products = await this.vehicleAllocationRepository.findProducts(db);
    const procurementRules =
      await this.vehicleAllocationRepository.findDistributorProcurementRules(
        db,
      );

    const validVehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
    const validDistributorIds = new Set(
      distributors.map((distributor) => distributor.id),
    );

    const assignedVehicles = new Set<number>();

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    const validProcurementRules = new Set<string>();

    for (const rule of procurementRules) {
      for (const product of products) {
        if (
          product.brand_id === rule.brand_id &&
          product.product_group_id === rule.product_group_id &&
          product.master_product_group.category === rule.category
        ) {
          validProcurementRules.add(
            `${rule.distributor_id}_${rule.category}_${product.id}`,
          );
        }
      }
    }

    const allocationsByVehicle = new Map<
      number,
      { productId: number; distributorId: number; category: SupplyCategory }[]
    >();

    for (const allocation of dto.allocations) {
      if (Number(allocation.allocatedQty) <= 0) {
        continue;
      }

      const product = productMap.get(allocation.productId);

      if (!product) {
        throw new BadRequestException(
          `Product ${allocation.productId} not found`,
        );
      }

      const existing = allocationsByVehicle.get(allocation.vehicleId) ?? [];

      existing.push({
        productId: allocation.productId,
        distributorId: allocation.distributorId,
        category: allocation.category,
      });

      allocationsByVehicle.set(allocation.vehicleId, existing);
    }

    const assignedVehicleIds = new Set(dto.assignments.map((a) => a.vehicleId));

    for (const vehicleId of allocationsByVehicle.keys()) {
      if (!assignedVehicleIds.has(vehicleId)) {
        throw new BadRequestException(
          `Vehicle ${vehicleId} has allocations but no distributor assignment row`,
        );
      }
    }

    for (const assignment of dto.assignments) {
      if (!validVehicleIds.has(assignment.vehicleId)) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_NOT_FOUND,
        );
      }

      if (assignedVehicles.has(assignment.vehicleId)) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DUPLICATE_VEHICLE_ASSIGNMENT,
        );
      }

      if (
        assignment.milkDistributorId != null &&
        !validDistributorIds.has(assignment.milkDistributorId)
      ) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_NOT_FOUND(
            assignment.milkDistributorId,
          ),
        );
      }

      if (
        assignment.nonMilkDistributorId != null &&
        !validDistributorIds.has(assignment.nonMilkDistributorId)
      ) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_NOT_FOUND(
            assignment.nonMilkDistributorId,
          ),
        );
      }

      const vehicleProducts =
        allocationsByVehicle.get(assignment.vehicleId) ?? [];

      for (const product of vehicleProducts) {
        if (product.category === SupplyCategory.MILK) {
          if (!assignment.milkDistributorId) {
            throw new BadRequestException(
              VEHICLE_ALLOCATION_ERROR_MESSAGES.MISSING_MILK_DISTRIBUTOR_ASSIGNMENT(
                assignment.vehicleId,
              ),
            );
          }

          if (assignment.milkDistributorId !== product.distributorId) {
            throw new BadRequestException(
              `Milk allocation distributor mismatch for vehicle ${assignment.vehicleId}, product ${product.productId}`,
            );
          }

          const ruleKey = `${assignment.milkDistributorId}_${product.category}_${product.productId}`;

          if (!validProcurementRules.has(ruleKey)) {
            throw new BadRequestException(
              VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_CANNOT_PROCURE_PRODUCT(
                assignment.milkDistributorId,
                product.productId,
              ),
            );
          }
        }

        if (product.category === SupplyCategory.NON_MILK) {
          if (!assignment.nonMilkDistributorId) {
            throw new BadRequestException(
              VEHICLE_ALLOCATION_ERROR_MESSAGES.MISSING_NON_MILK_DISTRIBUTOR_ASSIGNMENT(
                assignment.vehicleId,
              ),
            );
          }

          if (assignment.nonMilkDistributorId !== product.distributorId) {
            throw new BadRequestException(
              `Non-milk allocation distributor mismatch for vehicle ${assignment.vehicleId}, product ${product.productId}`,
            );
          }

          const ruleKey = `${assignment.nonMilkDistributorId}_${product.category}_${product.productId}`;

          if (!validProcurementRules.has(ruleKey)) {
            throw new BadRequestException(
              VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_CANNOT_PROCURE_PRODUCT(
                assignment.nonMilkDistributorId,
                product.productId,
              ),
            );
          }
        }
      }

      assignedVehicles.add(assignment.vehicleId);
    }
  }

  async validateVehicleAssignmentsForNightSubmit(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const allocationGrid = await this.getAllocationGrid(
      paperId,
      DeliverySession.NIGHT,
      db,
    );

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaper(
        paperId,
        DeliverySession.NIGHT,
        db,
      );

    if (!vehicleAllocationPaper) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_ALLOCATIONS_NOT_FOUND,
      );
    }

    const assignments =
      await this.vehicleAllocationRepository.findVehicleAssignments(
        vehicleAllocationPaper.id,
      );

    const assignedCategories = new Set(
      assignments.map(
        (assignment) => `${assignment.vehicle_id}_${assignment.category}`,
      ),
    );

    for (const allocation of allocationGrid.allocations) {
      const category = allocation.category;

      for (const row of allocation.rows) {
        let hasAllocation = false;

        for (const [field, value] of Object.entries(row)) {
          if (!field.startsWith('product_')) {
            continue;
          }

          if (Number(value) > 0) {
            hasAllocation = true;
            break;
          }
        }

        if (!hasAllocation) {
          continue;
        }

        const assignmentKey = `${row.vehicleId}_${category}`;

        if (!assignedCategories.has(assignmentKey)) {
          throw new BadRequestException(
            VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_WITHOUT_CATEGORY_DISTRIBUTOR(
              row.vehicleId,
              category,
            ),
          );
        }
      }
    }
  }

  async validateAllocationProductLinks(
    dto: SaveVehicleAllocationDto,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const invalidAllocations: string[] = [];

    for (const allocation of dto.allocations) {
      if (allocation.allocatedQty <= 0) continue;

      const productLink = await this.vehicleAllocationRepository.getProductLink(
        allocation.distributorId,
        allocation.productId,
        db,
      );

      if (!productLink) {
        invalidAllocations.push(
          `Distributor ${allocation.distributorId} does not source Product ${allocation.productId}`,
        );
      }
    }

    if (invalidAllocations.length > 0) {
      throw new BadRequestException({
        message: 'Invalid product allocations',
        details: invalidAllocations,
      });
    }
  }
}
