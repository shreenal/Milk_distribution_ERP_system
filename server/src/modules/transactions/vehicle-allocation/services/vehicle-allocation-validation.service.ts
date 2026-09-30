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
import {
  moneyEquals,
  toDecimal,
  toMoney,
} from '../../../../common/utils/money.util.js';

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
        const allocatedQty = allocation.rows.reduce(
          (sum, row) => sum.plus(toDecimal(row[field] ?? 0)),
          toDecimal(0),
        );

        // M1: was `allocatedQty !== Number(requiredQty)` on values summed
        // as native floats — legitimate quantities like 0.1 + 0.2 could
        // false-positive an "allocation mismatch" and block night/morning
        // submit. 0.005 tolerance matches the reconciliation tolerance
        // used elsewhere (cash-settlement-validation.service.ts).
        if (!moneyEquals(allocatedQty, toDecimal(requiredQty), 0.005)) {
          throw new BadRequestException(
            `${allocation.brand.name} ${field} allocation mismatch. Required: ${requiredQty}, Allocated: ${toMoney(allocatedQty)}`,
          );
        }
      }
    }
  }

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
    const candidates = dto.allocations.filter((a) => a.allocatedQty > 0);

    const linkMap = await this.vehicleAllocationRepository.getProductLinksBatch(
      candidates.map((a) => ({
        distributorId: a.distributorId,
        productId: a.productId,
      })),
      db,
      true,
    );

    const invalidAllocations = candidates
      .filter((a) => !linkMap.has(`${a.distributorId}_${a.productId}`))
      .map(
        (a) =>
          `Distributor ${a.distributorId} does not have an active link to Product ${a.productId}`,
      );

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
