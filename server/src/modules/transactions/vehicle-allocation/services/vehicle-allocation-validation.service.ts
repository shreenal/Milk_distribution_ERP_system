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
import { AllocationGridResult } from '../../../../types/vehicle-allocation.types.js';

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

    // Only (distributor, category, product) combos actually resolved for
    // this order's items are valid allocation targets.
    const requiredKeys = new Set<string>();
    for (const summary of summaries) {
      for (const product of summary.products) {
        requiredKeys.add(
          `${summary.distributorId}_${summary.category}_${product.id}`,
        );
      }
    }

    for (const allocation of dto.allocations) {
      if (Number(allocation.allocatedQty) <= 0) continue;

      const key = `${allocation.distributorId}_${allocation.category}_${allocation.productId}`;

      if (!requiredKeys.has(key)) {
        throw new BadRequestException(
          `Product ${allocation.productId} is not required from distributor ${allocation.distributorId} for category ${allocation.category} in this order`,
        );
      }
    }
  }

  /**
   * Business restriction: within a vehicle_allocation_paper (i.e. a single
   * paper/session), all positive allocations for a given (vehicleId,
   * category) must belong to exactly one distributorId. A vehicle cannot
   * source the same category from two distributors in one session.
   *
   * This replaces the old vehicle_distribution_assignment table/validation.
   * distributor_id on vehicle_allocation is now the sole source of truth —
   * this check just enforces that all rows for a (vehicle, category) group
   * agree on it.
   */
  validateSingleDistributorPerVehicleCategory(
    dto: SaveVehicleAllocationDto,
  ): void {
    const groups = new Map<
      string,
      {
        vehicleId: number;
        category: SupplyCategory;
        distributorIds: Set<number>;
      }
    >();

    for (const allocation of dto.allocations) {
      if (Number(allocation.allocatedQty) <= 0) continue;

      const key = `${allocation.vehicleId}_${allocation.category}`;
      const group = groups.get(key) ?? {
        vehicleId: allocation.vehicleId,
        category: allocation.category,
        distributorIds: new Set<number>(),
      };

      group.distributorIds.add(allocation.distributorId);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      if (group.distributorIds.size > 1) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_MISMATCH_WITHIN_CATEGORY(
            group.vehicleId,
            group.category,
            Array.from(group.distributorIds),
          ),
        );
      }
    }
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

    this.validateCoverage(allocationGrid);
    this.validateSingleDistributorFromGrid(allocationGrid);
  }

  async validateVehicleAllocationsForMorningSubmit(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    const allocationGrid = await this.getAllocationGrid(
      paperId,
      DeliverySession.MORNING,
      db,
    );

    this.validateCoverage(allocationGrid);
    this.validateSingleDistributorFromGrid(allocationGrid);
  }

  private validateCoverage(allocationGrid: AllocationGridResult): void {
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

  /**
   * Submit-time defense-in-depth: re-checks the same single-distributor
   * invariant against persisted rows, mirroring how coverage is rechecked
   * here rather than trusted purely from save-time validation.
   */
  private validateSingleDistributorFromGrid(
    allocationGrid: AllocationGridResult,
  ): void {
    const groups = new Map<
      string,
      {
        vehicleId: number;
        category: SupplyCategory;
        distributorIds: Set<number>;
      }
    >();

    for (const grid of allocationGrid.allocations) {
      for (const row of grid.rows) {
        const hasPositiveQty = Object.entries(row).some(
          ([field, value]) => field.startsWith('product_') && Number(value) > 0,
        );

        if (!hasPositiveQty) continue;

        const key = `${row.vehicleId}_${grid.category}`;
        const group = groups.get(key) ?? {
          vehicleId: row.vehicleId,
          category: grid.category,
          distributorIds: new Set<number>(),
        };

        group.distributorIds.add(grid.distributor.id);
        groups.set(key, group);
      }
    }

    for (const group of groups.values()) {
      if (group.distributorIds.size > 1) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_MISMATCH_WITHIN_CATEGORY(
            group.vehicleId,
            group.category,
            Array.from(group.distributorIds),
          ),
        );
      }
    }
  }

  private async getGroupSummary(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction,
  ) {
    const orderItems =
      await this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
        paperId,
        db,
      );

    return this.allocationSummaryBuilder.build(orderItems, session);
  }

  private async getAllocationGrid(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction,
  ): Promise<AllocationGridResult> {
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
        true,
      );

      if (!productLink) {
        invalidAllocations.push(
          `Distributor ${allocation.distributorId} does not have an active link to Product ${allocation.productId}`,
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

  validateNoDuplicateAllocations(dto: SaveVehicleAllocationDto): void {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const allocation of dto.allocations) {
      const key = `${allocation.vehicleId}_${allocation.distributorId}_${allocation.category}_${allocation.productId}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Duplicate allocation entries found: ${duplicates.join(', ')}. Each vehicle-distributor-category-product combination can only appear once.`,
      );
    }
  }
}
