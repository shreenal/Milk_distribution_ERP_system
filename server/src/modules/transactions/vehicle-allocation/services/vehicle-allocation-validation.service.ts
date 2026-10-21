import { Injectable, BadRequestException } from '@nestjs/common';
import { SaveVehicleAllocationDto } from '../dto/save-vehicle-allocation.dto.js';
import { VehicleAllocationRepository } from '../vehicle-allocation.repository.js';
import { VehicleAllocationBuilder } from '../vehicle-allocation.builder.js';
import { VehicleAllocationReconciliationService } from './vehicle-allocation-reconciliation.service.js';
import { VEHICLE_ALLOCATION_ERROR_MESSAGES } from '../vehicle-allocation.constants.js';
import { AllocationSummaryBuilder } from '../../../../common/builders/allocation-summary.builder.js';
import {
  DeliverySession,
  VehicleAllocationAnomalyStatus,
} from '../../../../generated/prisma/client.js';
import { OrderItemsRepository } from '../../../../common/repositories/order-items.repository.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { AllocationSummary } from '../../../../common/builders/allocation-summary.builder.js';
import {
  buildRequirementKey,
  describeAllocationRow,
  describeProduct,
  describeVehicle,
  findDistributorConflicts,
} from '../vehicle-allocation.util.js';
import { ANOMALY_REASON_MESSAGES } from '../vehicle-allocation.constants.js';

type Allocations = SaveVehicleAllocationDto['allocations'];

export type AllocationReferences = {
  vehicles: Map<
    number,
    {
      id: number;
      vehicle_name: string | null;
      vehicle_number: string;
      is_active: boolean;
    }
  >;
  productLabels: Map<number, string>;
  distributorNames: Map<number, string>;
};

export type AllocationRequirements = {
  orderItems: Awaited<
    ReturnType<OrderItemsRepository['getOrderItemsWithSupplyContextByPaperId']>
  >;
  summaries: AllocationSummary[];
  requiredTotals: Map<string, number>;
  productLabels: Map<number, string>;
};

@Injectable()
export class VehicleAllocationValidationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,
    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,
    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly reconciliationService: VehicleAllocationReconciliationService,
  ) {}

  // ---------------------------------------------------------------------
  // Requirements (what the current orders ask for in a session)
  // ---------------------------------------------------------------------

  async loadRequirements(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction,
  ): Promise<AllocationRequirements> {
    const orderItems =
      await this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
        paperId,
        db,
      );

    // VA-3.3: only products with positive demand take part.
    const summaries = this.vehicleAllocationBuilder.filterPositiveDemand(
      this.allocationSummaryBuilder.build(orderItems, session),
    );

    return {
      orderItems,
      summaries,
      requiredTotals:
        this.vehicleAllocationBuilder.buildRequiredTotals(summaries),
      productLabels:
        this.vehicleAllocationBuilder.buildProductLabelMap(summaries),
    };
  }

  // ---------------------------------------------------------------------
  // Save-time validation (all run before any write)
  // ---------------------------------------------------------------------

  async resolveReferences(
    allocations: Allocations,
    db: PrismaOrTransaction,
  ): Promise<AllocationReferences> {
    const unique = (ids: number[]) => [...new Set(ids)];

    const [vehicles, products, distributors] = await Promise.all([
      this.vehicleAllocationRepository.findVehiclesByIds(
        unique(allocations.map((a) => a.vehicleId)),
        db,
      ),
      this.vehicleAllocationRepository.findProductsForLabels(
        unique(allocations.map((a) => a.productId)),
        db,
      ),
      this.vehicleAllocationRepository.findDistributorsByIds(
        unique(allocations.map((a) => a.distributorId)),
        db,
      ),
    ]);

    const productLabels = new Map<number, string>();
    for (const product of products) {
      productLabels.set(product.id, describeProduct(product));
    }

    return {
      vehicles: new Map(vehicles.map((v) => [v.id, v])),
      productLabels,
      distributorNames: new Map(distributors.map((d) => [d.id, d.name])),
    };
  }

  /** VA-5.8: unknown vehicles are rejected for every entry; inactive ones when qty > 0. */
  validateVehicleReferences(
    dto: SaveVehicleAllocationDto,
    refs: AllocationReferences,
  ): void {
    const problems = new Set<string>();

    for (const allocation of dto.allocations) {
      const vehicle = refs.vehicles.get(allocation.vehicleId);

      if (!vehicle) {
        problems.add(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_NOT_FOUND(
            allocation.vehicleId,
          ),
        );
        continue;
      }

      if (!vehicle.is_active && allocation.allocatedQty > 0) {
        problems.add(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.VEHICLE_INACTIVE(
            describeVehicle(vehicle),
          ),
        );
      }
    }

    if (problems.size > 0) {
      throw new BadRequestException({
        message: 'Invalid vehicle references',
        details: [...problems],
      });
    }
  }

  /** VA-5.7: links are checked only for rows with qty > 0. */
  async validateAllocationProductLinks(
    dto: SaveVehicleAllocationDto,
    refs: AllocationReferences,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const candidates = dto.allocations.filter((a) => a.allocatedQty > 0);
    if (candidates.length === 0) return;

    const linkMap = await this.vehicleAllocationRepository.getProductLinksBatch(
      candidates.map((a) => ({
        distributorId: a.distributorId,
        productId: a.productId,
      })),
      db,
      true,
    );

    const invalid = candidates
      .filter((a) => !linkMap.has(`${a.distributorId}_${a.productId}`))
      .map((a) =>
        VEHICLE_ALLOCATION_ERROR_MESSAGES.LINK_MISSING(
          distributorName(refs, a.distributorId),
          productName(refs, a.productId),
        ),
      );

    if (invalid.length > 0) {
      throw new BadRequestException({
        message: 'Invalid product allocations',
        details: [...new Set(invalid)],
      });
    }
  }

  validateRequiredAllocations(
    dto: SaveVehicleAllocationDto,
    requiredTotals: Map<string, number>,
    refs: AllocationReferences,
  ): void {
    const invalid = dto.allocations
      .filter(
        (a) =>
          a.allocatedQty > 0 &&
          !requiredTotals.has(
            buildRequirementKey(a.distributorId, a.category, a.productId),
          ),
      )
      .map((a) =>
        VEHICLE_ALLOCATION_ERROR_MESSAGES.NOT_REQUIRED(
          distributorName(refs, a.distributorId),
          a.category,
          productName(refs, a.productId),
        ),
      );

    if (invalid.length > 0) {
      throw new BadRequestException({
        message: 'Invalid product allocations',
        details: [...new Set(invalid)],
      });
    }
  }

  validateNoDuplicateAllocations(
    dto: SaveVehicleAllocationDto,
    refs: AllocationReferences,
  ): void {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const a of dto.allocations) {
      const key = `${a.vehicleId}_${a.distributorId}_${a.category}_${a.productId}`;
      if (seen.has(key)) {
        duplicates.push(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DUPLICATE_ENTRY(
            vehicleName(refs, a.vehicleId),
            distributorName(refs, a.distributorId),
            a.category,
            productName(refs, a.productId),
          ),
        );
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      throw new BadRequestException({
        message:
          'Duplicate allocation entries. Each vehicle, distributor, category and product combination can only appear once.',
        details: [...new Set(duplicates)],
      });
    }
  }

  validateSingleDistributorPerVehicleCategory(
    dto: SaveVehicleAllocationDto,
    refs: AllocationReferences,
  ): void {
    const conflicts = findDistributorConflicts(
      dto.allocations
        .filter((a) => a.allocatedQty > 0)
        .map((a) => ({
          vehicleId: a.vehicleId,
          distributorId: a.distributorId,
          category: a.category,
        })),
    );

    if (conflicts.length > 0) {
      throw new BadRequestException({
        message:
          'A vehicle cannot take a category from more than one distributor',
        details: conflicts.map((c) =>
          VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_MISMATCH_WITHIN_CATEGORY(
            vehicleName(refs, c.vehicleId),
            c.category,
            c.distributorIds.map((id) => distributorName(refs, id)),
          ),
        ),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Submission gates (called from the paper's night / morning submit)
  // ---------------------------------------------------------------------

  async validateVehicleAllocationsForNightSubmit(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    await this.validateSessionForSubmit(paperId, DeliverySession.NIGHT, db);
  }

  async validateVehicleAllocationsForMorningSubmit(
    paperId: number,
    db: PrismaOrTransaction,
  ) {
    await this.validateSessionForSubmit(paperId, DeliverySession.MORNING, db);
  }

  /**
   * VA-8: two independent layers, both always evaluated and reported together.
   *   Layer 1 - quantity coverage of every product with positive demand.
   *   Layer 2 - data integrity: invalid / stale / unresolved allocation records.
   */
  private async validateSessionForSubmit(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const requirements = await this.loadRequirements(paperId, session, db);
    const vehicles = await this.vehicleAllocationRepository.findVehicles(db);
    const allocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaper(
        paperId,
        session,
        db,
      );

    const stored = allocationPaper
      ? await this.vehicleAllocationRepository.findVehicleAllocations(
          allocationPaper.id,
          db,
        )
      : [];

    // Layer 1
    const grids = this.vehicleAllocationBuilder.applyVehicleAllocations(
      this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
        requirements.summaries,
        vehicles,
      ),
      stored,
    );

    const coverageProblems = this.vehicleAllocationBuilder
      .calculateCoverage(grids, requirements.productLabels)
      .filter((line) => !line.isComplete)
      .map(
        (line) =>
          `${line.distributorName} (${line.category}) / ${line.productName}: required ${line.requiredQty}, allocated ${line.allocatedQty}`,
      );

    // Layer 2
    const detection = await this.reconciliationService.detect(
      stored,
      requirements.requiredTotals,
      db,
    );
    const integrityProblems: string[] = [];

    for (const { row, reason } of detection.invalid) {
      integrityProblems.push(
        `${describeAllocationRow(row)}: ${ANOMALY_REASON_MESSAGES[reason]}`,
      );
    }

    for (const stale of detection.stale) {
      integrityProblems.push(
        `${describeAllocationRow(stale.row)}: required quantity changed from ${stale.requiredAtSave} to ${stale.currentRequired} since it was saved`,
      );
    }

    if (allocationPaper) {
      const flagged = await this.vehicleAllocationRepository.findAnomalies(
        allocationPaper.id,
        VehicleAllocationAnomalyStatus.FLAGGED,
        db,
      );
      for (const anomaly of flagged) {
        integrityProblems.push(
          `${this.reconciliationService.toAnomalyView(anomaly).message} It is still unresolved`,
        );
      }
    }

    const invalidIds = new Set(detection.invalid.map((i) => i.row.id));
    const names = new Map(stored.map((r) => [r.vehicle_id, r.master_vehicle]));
    const distributors = new Map(
      stored.map((r) => [r.distributor_id, r.distributor.name]),
    );
    for (const conflict of findDistributorConflicts(
      stored
        .filter((r) => !invalidIds.has(r.id))
        .map((r) => ({
          vehicleId: r.vehicle_id,
          distributorId: r.distributor_id,
          category: r.category,
        })),
    )) {
      const vehicle = names.get(conflict.vehicleId);
      integrityProblems.push(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.DISTRIBUTOR_MISMATCH_WITHIN_CATEGORY(
          vehicle ? describeVehicle(vehicle) : `#${conflict.vehicleId}`,
          conflict.category,
          conflict.distributorIds.map((id) => distributors.get(id) ?? `#${id}`),
        ),
      );
    }

    if (coverageProblems.length > 0 || integrityProblems.length > 0) {
      throw new BadRequestException({
        message:
          VEHICLE_ALLOCATION_ERROR_MESSAGES.NOT_READY_FOR_SUBMISSION(session),
        coverage: coverageProblems,
        integrity: integrityProblems,
        details: [...coverageProblems, ...integrityProblems],
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Label helpers (names for error messages, never raw ids unless unknown)
// ---------------------------------------------------------------------------

function productName(refs: AllocationReferences, id: number): string {
  return refs.productLabels.get(id) ?? `product #${id}`;
}

function distributorName(refs: AllocationReferences, id: number): string {
  return refs.distributorNames.get(id) ?? `distributor #${id}`;
}

function vehicleName(refs: AllocationReferences, id: number): string {
  const vehicle = refs.vehicles.get(id);
  return vehicle ? describeVehicle(vehicle) : `vehicle #${id}`;
}
