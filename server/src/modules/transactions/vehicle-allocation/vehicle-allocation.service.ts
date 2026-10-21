import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { ReconcileVehicleAllocationDto } from './dto/reconcile-vehicle-allocation.dto.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { VehicleAllocationValidationService } from './services/vehicle-allocation-validation.service.js';
import { VehicleAllocationReconciliationService } from './services/vehicle-allocation-reconciliation.service.js';
import {
  STALE_DATA_MESSAGE,
  VEHICLE_ALLOCATION_ERROR_MESSAGES,
} from './vehicle-allocation.constants.js';
import {
  DeliverySession,
  Prisma,
  SupplyCategory,
  VehicleAllocationAnomalyStatus,
} from '../../../generated/prisma/client.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { GroupSummaryBuilder } from '../../../common/builders/group-summary.builder.js';
import { buildAllocationKey } from '../../../common/utils/allocation-key.util.js';
import {
  buildRequirementKey,
  describeProduct,
  describeVehicle,
  findDistributorConflicts,
} from './vehicle-allocation.util.js';

type IncomingAllocation = {
  vehicle_id: number;
  distributor_id: number;
  category: SupplyCategory;
  product_id: number;
  allocated_qty: number;
  required_qty_at_save: number;
};

@Injectable()
export class VehicleAllocationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,
    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,
    private readonly groupSummaryBuilder: GroupSummaryBuilder,
    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,
    private readonly reconciliationService: VehicleAllocationReconciliationService,
    private readonly workflowState: WorkflowStateService,
    private readonly workflowBuilder: WorkflowBuilder,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------

  async getVehicleAllocations(paperId: number, session: DeliverySession) {
    return this.prisma.$transaction(
      async (tx) => {
        const paper = await this.vehicleAllocationRepository.findOrderPaperById(
          paperId,
          tx,
        );
        if (!paper) {
          throw new NotFoundException(
            VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
          );
        }

        const requirements =
          await this.vehicleAllocationValidationService.loadRequirements(
            paperId,
            session,
            tx,
          );
        const vehicles =
          await this.vehicleAllocationRepository.findVehicles(tx);

        const allocationGrids =
          this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
            requirements.summaries,
            vehicles,
          );
        const groupSummaries = this.groupSummaryBuilder.build(
          requirements.orderItems,
          session,
        );
        const workflow = this.workflowBuilder.buildVehicleAllocationWorkflow(
          paper.status,
          session,
        );

        const allocationPaper =
          await this.vehicleAllocationRepository.findVehicleAllocationPaper(
            paperId,
            session,
            tx,
          );

        const stored = allocationPaper
          ? await this.vehicleAllocationRepository.findVehicleAllocations(
              allocationPaper.id,
              tx,
            )
          : [];

        const detection = await this.reconciliationService.detect(
          stored,
          requirements.requiredTotals,
          tx,
        );
        const invalidIds = new Set(detection.invalid.map((i) => i.row.id));
        const validStored = stored.filter((r) => !invalidIds.has(r.id));

        const allocationResult =
          this.vehicleAllocationBuilder.applyVehicleAllocations(
            allocationGrids,
            validStored,
          );

        const flagged = allocationPaper
          ? await this.vehicleAllocationRepository.findAnomalies(
              allocationPaper.id,
              VehicleAllocationAnomalyStatus.FLAGGED,
              tx,
            )
          : [];

        const coverage = this.vehicleAllocationBuilder.calculateCoverage(
          allocationResult,
          requirements.productLabels,
        );
        const coverageComplete = coverage.every((line) => line.isComplete);

        const staleAllocations = [
          ...detection.invalid.map((i) =>
            this.reconciliationService.toInvalidView(i),
          ),
          ...detection.stale.map((s) =>
            this.reconciliationService.toStaleView(s),
          ),
        ];
        const anomalies = flagged.map((a) =>
          this.reconciliationService.toAnomalyView(a),
        );

        const hasDistributorConflict =
          findDistributorConflicts(
            validStored.map((r) => ({
              vehicleId: r.vehicle_id,
              distributorId: r.distributor_id,
              category: r.category,
            })),
          ).length > 0;
        const hasUnresolvedAnomalies =
          staleAllocations.length > 0 || anomalies.length > 0;

        return {
          workflow,
          ...allocationResult,
          groupSummaries,
          vehicleAllocationPaperUpdatedAt: allocationPaper?.updated_at ?? null,
          // VA-3.4 / VA-5.12: completion indicators for the UI.
          completion: { isComplete: coverageComplete, lines: coverage },
          // VA-6: warning badge data.
          staleAllocations,
          anomalies,
          submission: {
            ready:
              coverageComplete &&
              !hasUnresolvedAnomalies &&
              !hasDistributorConflict,
            coverageComplete,
            hasUnresolvedAnomalies,
            hasDistributorConflict,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
      },
    );
  }

  // ---------------------------------------------------------------------
  // Save (full snapshot)
  // ---------------------------------------------------------------------

  async saveVehicleAllocations(paperId: number, dto: SaveVehicleAllocationDto) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const { existingPaper } = await this.loadWritableContext(
            paperId,
            dto.session,
            dto.expectedUpdatedAt,
            tx,
          );

          const requirements =
            await this.vehicleAllocationValidationService.loadRequirements(
              paperId,
              dto.session,
              tx,
            );
          const refs =
            await this.vehicleAllocationValidationService.resolveReferences(
              dto.allocations,
              tx,
            );

          const validation = this.vehicleAllocationValidationService;
          validation.validateNoDuplicateAllocations(dto, refs);
          validation.validateVehicleReferences(dto, refs);
          await validation.validateAllocationProductLinks(dto, refs, tx);
          validation.validateRequiredAllocations(
            dto,
            requirements.requiredTotals,
            refs,
          );
          validation.validateSingleDistributorPerVehicleCategory(dto, refs);

          // VA-5.6: zero / blank rows are never stored.
          const incoming: IncomingAllocation[] = dto.allocations
            .filter((a) => a.allocatedQty > 0)
            .map((a) => ({
              vehicle_id: a.vehicleId,
              distributor_id: a.distributorId,
              category: a.category,
              product_id: a.productId,
              allocated_qty: a.allocatedQty,
              required_qty_at_save: requirements.requiredTotals.get(
                buildRequirementKey(a.distributorId, a.category, a.productId),
              )!,
            }));

          const stored = existingPaper
            ? await this.vehicleAllocationRepository.findVehicleAllocations(
                existingPaper.id,
                tx,
              )
            : [];

          const detection = await this.reconciliationService.detect(
            stored,
            requirements.requiredTotals,
            tx,
          );
          const invalidKeys = new Set(
            detection.invalid.map((i) => buildAllocationKey(i.row)),
          );

          // VA-5.4: a stored row that is not in the payload at all (neither
          // kept nor set to 0) is a possible accidental omission. Invalid rows
          // are cleaned automatically (VA-6.3) and are not counted here.
          const payloadKeys = new Set(
            dto.allocations.map((a) => buildAllocationKey(a)),
          );
          const omitted = stored.filter((row) => {
            const key = buildAllocationKey(row);
            return !invalidKeys.has(key) && !payloadKeys.has(key);
          });

          if (omitted.length > 0 && !dto.confirmDeletions) {
            throw new BadRequestException({
              message:
                VEHICLE_ALLOCATION_ERROR_MESSAGES.DELETIONS_NEED_CONFIRMATION,
              droppedAllocations: omitted.map((row) => ({
                vehicleId: row.vehicle_id,
                vehicleName: describeVehicle(row.master_vehicle),
                distributorId: row.distributor_id,
                distributorName: row.distributor.name,
                category: row.category,
                productId: row.product_id,
                productName: describeProduct(row.master_product),
                allocatedQty: Number(row.allocated_qty),
              })),
              // The confirmation must be sent with this token (VA-5.5).
              vehicleAllocationPaperUpdatedAt:
                existingPaper?.updated_at.toISOString() ?? null,
            });
          }

          const flaggedBefore = existingPaper
            ? await this.vehicleAllocationRepository.findAnomalies(
                existingPaper.id,
                VehicleAllocationAnomalyStatus.FLAGGED,
                tx,
              )
            : [];
          const resolvable = this.reconciliationService.selectResolvable(
            flaggedBefore,
            requirements.requiredTotals,
            incoming,
          );

          const hasChanges =
            !sameRowSet(stored, incoming) || resolvable.length > 0;

          if (!hasChanges) {
            return {
              success: true,
              changed: false,
              vehicleAllocationPaperUpdatedAt:
                existingPaper?.updated_at.toISOString() ?? null,
              flaggedAnomalies: 0,
              reconciledAnomalies: 0,
            };
          }

          const allocationPaper = await this.advanceToken(
            paperId,
            dto.session,
            existingPaper,
            dto.expectedUpdatedAt,
            tx,
          );

          // Evidence first, then the rows are replaced (invalid ones drop out).
          await this.reconciliationService.flagInvalid(
            allocationPaper.id,
            detection.invalid,
            tx,
          );

          await this.vehicleAllocationRepository.replaceVehicleAllocations(
            allocationPaper.id,
            incoming.map((row) => ({
              vehicle_allocation_paper_id: allocationPaper.id,
              ...row,
            })),
            tx,
          );

          await this.reconciliationService.markReconciled(resolvable, tx);

          return {
            success: true,
            changed: true,
            vehicleAllocationPaperUpdatedAt:
              allocationPaper.token.toISOString(),
            flaggedAnomalies: detection.invalid.length,
            reconciledAnomalies: resolvable.length,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Reconcile (cleanup without changing quantities)
  // ---------------------------------------------------------------------

  async reconcileVehicleAllocations(
    paperId: number,
    dto: ReconcileVehicleAllocationDto,
  ) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const { existingPaper } = await this.loadWritableContext(
            paperId,
            dto.session,
            dto.expectedUpdatedAt,
            tx,
          );

          const noChange = {
            success: true,
            changed: false,
            vehicleAllocationPaperUpdatedAt:
              existingPaper?.updated_at.toISOString() ?? null,
            flaggedAnomalies: 0,
            reconciledAnomalies: 0,
          };

          // Nothing has ever been saved: nothing can be stale.
          if (!existingPaper) return noChange;

          const requirements =
            await this.vehicleAllocationValidationService.loadRequirements(
              paperId,
              dto.session,
              tx,
            );
          const stored =
            await this.vehicleAllocationRepository.findVehicleAllocations(
              existingPaper.id,
              tx,
            );
          const detection = await this.reconciliationService.detect(
            stored,
            requirements.requiredTotals,
            tx,
          );
          const invalidIds = new Set(detection.invalid.map((i) => i.row.id));
          const remaining = stored.filter((r) => !invalidIds.has(r.id));

          const flaggedBefore =
            await this.vehicleAllocationRepository.findAnomalies(
              existingPaper.id,
              VehicleAllocationAnomalyStatus.FLAGGED,
              tx,
            );
          const resolvable = this.reconciliationService.selectResolvable(
            flaggedBefore,
            requirements.requiredTotals,
            remaining,
          );

          if (detection.invalid.length === 0 && resolvable.length === 0) {
            return noChange;
          }

          const allocationPaper = await this.advanceToken(
            paperId,
            dto.session,
            existingPaper,
            dto.expectedUpdatedAt,
            tx,
          );

          await this.reconciliationService.flagInvalid(
            allocationPaper.id,
            detection.invalid,
            tx,
          );
          await this.vehicleAllocationRepository.deleteVehicleAllocationsByIds(
            detection.invalid.map((i) => i.row.id),
            tx,
          );
          await this.reconciliationService.markReconciled(resolvable, tx);

          return {
            success: true,
            changed: true,
            vehicleAllocationPaperUpdatedAt:
              allocationPaper.token.toISOString(),
            flaggedAnomalies: detection.invalid.length,
            reconciledAnomalies: resolvable.length,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Shared write protection (VA-9): same checks for every write path
  // ---------------------------------------------------------------------

  private parseExpected(expected: string | null): Date | null {
    if (expected === null) return null;
    const date = new Date(expected);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.INVALID_EXPECTED_UPDATED_AT,
      );
    }
    return date;
  }

  private editableSessions(
    status: Parameters<WorkflowStateService['canEditVehicleAllocations']>[0],
  ) {
    return [DeliverySession.NIGHT, DeliverySession.MORNING].filter((s) =>
      this.workflowState.canEditVehicleAllocations(status, s),
    );
  }

  /**
   * Paper exists (404) -> session is editable (400) -> token matches (409).
   * An explicit null token matches only while no allocation paper exists yet.
   */
  private async loadWritableContext(
    paperId: number,
    session: DeliverySession,
    expectedUpdatedAt: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const paper = await this.vehicleAllocationRepository.findOrderPaperById(
      paperId,
      tx,
    );
    if (!paper) {
      throw new NotFoundException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    if (!this.workflowState.canEditVehicleAllocations(paper.status, session)) {
      throw new BadRequestException(
        VEHICLE_ALLOCATION_ERROR_MESSAGES.SESSION_NOT_EDITABLE(
          session,
          paper.status,
          this.editableSessions(paper.status),
        ),
      );
    }

    const existingPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaper(
        paperId,
        session,
        tx,
      );

    const expected = this.parseExpected(expectedUpdatedAt);
    const matches =
      expected === null
        ? existingPaper === null
        : existingPaper !== null &&
          existingPaper.updated_at.getTime() === expected.getTime();

    if (!matches) throw new ConflictException(STALE_DATA_MESSAGE);

    return { paper, existingPaper, expected };
  }

  /**
   * Atomic compare-and-advance of the token. First save: a plain insert, so a
   * concurrent first save conflicts instead of overwriting.
   */
  private async advanceToken(
    paperId: number,
    session: DeliverySession,
    existingPaper: { id: number } | null,
    expectedUpdatedAt: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: number; token: Date }> {
    if (existingPaper) {
      const touch =
        await this.vehicleAllocationRepository.touchVehicleAllocationPaperIfTokenMatches(
          existingPaper.id,
          this.parseExpected(expectedUpdatedAt)!,
          tx,
        );
      if (touch.count !== 1) throw new ConflictException(STALE_DATA_MESSAGE);
      return { id: existingPaper.id, token: touch.touchedAt };
    }

    const created =
      await this.vehicleAllocationRepository.createVehicleAllocationPaper(
        paperId,
        session,
        tx,
      );
    return { id: created.id, token: created.updated_at };
  }
}

function sameRowSet(
  existing: {
    vehicle_id: number;
    distributor_id: number;
    category: string;
    product_id: number;
    allocated_qty: unknown;
    required_qty_at_save?: unknown;
  }[],
  incoming: {
    vehicle_id: number;
    distributor_id: number;
    category: string;
    product_id: number;
    allocated_qty: unknown;
    required_qty_at_save?: unknown;
  }[],
): boolean {
  if (existing.length !== incoming.length) {
    return false;
  }

  // The required-quantity snapshot is part of the row: re-saving after the
  // requirement changed refreshes it, which counts as a change.
  const toComparable = (row: (typeof existing)[number]) =>
    `${buildAllocationKey(row)}_${Number(row.allocated_qty)}_${
      row.required_qty_at_save === null ||
      row.required_qty_at_save === undefined
        ? 'null'
        : Number(row.required_qty_at_save)
    }`;

  const sortedExisting = existing.map(toComparable).sort();
  const sortedIncoming = incoming.map(toComparable).sort();

  return sortedExisting.every(
    (value, index) => value === sortedIncoming[index],
  );
}
