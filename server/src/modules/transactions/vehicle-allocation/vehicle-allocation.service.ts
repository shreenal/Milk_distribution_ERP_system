import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { VehicleAllocationValidationService } from './services/vehicle-allocation-validation.service.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { VEHICLE_ALLOCATION_ERROR_MESSAGES } from './vehicle-allocation.constants.js';
import { DeliverySession } from '../../../generated/prisma/client.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { GroupSummaryBuilder } from '../../../common/builders/group-summary.builder.js';
// FIX F1 (consistency review): shared with vehicle-allocation.repository.ts
// instead of the ad-hoc key strings previously built inline here.
import { buildAllocationKey } from '../../../common/utils/allocation-key.util.js';
// FIX F10 (consistency review): shared with purchase.service.ts instead of
// each service hand-rolling its own "touch if unchanged, else 409" flow.
import { assertNotStale } from '../../../common/prisma/optimistic-concurrency.util.js';

const STALE_DATA_MESSAGE =
  'Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

@Injectable()
export class VehicleAllocationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,

    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,

    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,

    private readonly groupSummaryBuilder: GroupSummaryBuilder,

    private readonly orderItemsRepository: OrderItemsRepository,

    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,

    private readonly workflowState: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,

    private readonly prisma: PrismaService,
  ) {}

  private async getGroupSummaries(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const orderItems =
      await this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
        paperId,
        db,
      );

    return {
      summaries: this.allocationSummaryBuilder.build(orderItems, session),
      groupSummaries: this.groupSummaryBuilder.build(orderItems, session),
    };
  }

  async getVehicleAllocations(paperId: number, session: DeliverySession) {
    return this.prisma.$transaction(async (tx) => {
      const paper = await this.vehicleAllocationRepository.findOrderPaperById(
        paperId,
        tx,
      );
      if (!paper) {
        throw new BadRequestException(
          VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
        );
      }

      const [{ summaries, groupSummaries }, vehicles] = await Promise.all([
        this.getGroupSummaries(paperId, session, tx),
        this.vehicleAllocationRepository.findVehicles(tx),
      ]);

      const allocationGrids =
        this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
          summaries,
          vehicles,
        );

      const workflow = this.workflowBuilder.buildVehicleAllocationWorkflow(
        paper.status,
        session,
      );

      const vehicleAllocationPaper =
        await this.vehicleAllocationRepository.findVehicleAllocationPaper(
          paperId,
          session,
          tx,
        );

      if (!vehicleAllocationPaper) {
        return {
          // FIX F2/F5 (consistency review): `paper` used to be returned in
          // full here, duplicating `status` against `workflow.status` and
          // duplicating data already available from PaperContext on the
          // frontend. Nothing in the reviewed VehicleAllocationPage code
          // reads `data.paper`, so it's dropped.
          workflow,
          ...allocationGrids,
          groupSummaries,
          vehicleAllocationPaperUpdatedAt: null,
        };
      }

      const savedAllocations =
        await this.vehicleAllocationRepository.findVehicleAllocations(
          vehicleAllocationPaper.id,
          tx,
        );

      const allocationResult =
        this.vehicleAllocationBuilder.applyVehicleAllocations(
          allocationGrids,
          savedAllocations,
        );

      return {
        workflow,
        ...allocationResult,
        groupSummaries,
        vehicleAllocationPaperUpdatedAt: vehicleAllocationPaper.updated_at,
      };
    });
  }

  async saveVehicleAllocations(paperId: number, dto: SaveVehicleAllocationDto) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const paper =
            await this.vehicleAllocationRepository.findOrderPaperById(
              paperId,
              tx,
            );

          if (!paper) {
            throw new BadRequestException(
              VEHICLE_ALLOCATION_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
            );
          }

          const status = paper.status;
          const session = this.workflowState.getActiveExecutionSession(status);

          // FIX F12 (consistency review): GET requires an explicit `session`
          // and previously POST silently inferred it from paper status with
          // nothing to catch a mismatch between what the client thought it
          // was editing and what the server would actually write to. Now the
          // client states which session it's saving and the server confirms
          // it agrees, rather than silently substituting its own answer.
          if (dto.session !== session) {
            throw new BadRequestException(
              `Requested session ${dto.session} does not match the paper's current active execution session (${session}). Refresh and try again.`,
            );
          }

          if (!this.workflowState.canEditVehicleAllocations(status, session)) {
            throw new BadRequestException(
              VEHICLE_ALLOCATION_ERROR_MESSAGES.EDIT_NOT_ALLOWED,
            );
          }

          const existingPaper =
            await this.vehicleAllocationRepository.findVehicleAllocationPaper(
              paperId,
              session,
              tx,
            );

          // Fast sequential stale-read check. The atomic check further down is
          // still required for genuine concurrency. Standardized against
          // Purchase's savePurchases(): if the client read an updatedAt but the
          // paper no longer exists, that's a conflict, not "nothing to check".
          if (dto.expectedUpdatedAt) {
            if (!existingPaper) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
            if (
              new Date(dto.expectedUpdatedAt).getTime() !==
              existingPaper.updated_at.getTime()
            ) {
              throw new ConflictException(STALE_DATA_MESSAGE);
            }
          }

          await this.vehicleAllocationValidationService.validateAllocationProductLinks(
            dto,
            tx,
          );

          await this.vehicleAllocationValidationService.validateVehicleAllocations(
            paperId,
            dto,
            tx,
          );

          this.vehicleAllocationValidationService.validateNoDuplicateAllocations(
            dto,
          );

          this.vehicleAllocationValidationService.validateSingleDistributorPerVehicleCategory(
            dto,
          );

          const allocationRowsBase = dto.allocations
            .filter((allocation) => allocation.allocatedQty > 0)
            .map((allocation) => ({
              vehicle_id: allocation.vehicleId,
              distributor_id: allocation.distributorId,
              category: allocation.category,
              product_id: allocation.productId,
              allocated_qty: allocation.allocatedQty,
            }));

          const existingAllocations = existingPaper
            ? await this.vehicleAllocationRepository.findVehicleAllocations(
                existingPaper.id,
                tx,
              )
            : [];

          // FIX F3 (consistency review): Purchase's save already refuses to
          // silently drop previously-saved rows unless the caller passes
          // `confirmDeletions`. Vehicle Allocation's save didn't have the
          // same safeguard even though deleting a vehicle_allocation row has
          // a real downstream side effect — any purchase_entry pointing at
          // it via source_allocation_id gets SetNull'd. This mirrors
          // Purchase's contract so a save can't silently orphan a real
          // purchased quantity.
          const incomingAllocationKeys = new Set(
            allocationRowsBase.map((row) => buildAllocationKey(row)),
          );

          const allocationsAboutToBeDropped = existingAllocations.filter(
            (row) => !incomingAllocationKeys.has(buildAllocationKey(row)),
          );

          if (allocationsAboutToBeDropped.length > 0 && !dto.confirmDeletions) {
            throw new BadRequestException({
              message:
                'Saving would remove existing vehicle allocations that are no longer part of the submitted data. Confirm deletion to proceed.',
              droppedAllocations: allocationsAboutToBeDropped.map((row) => ({
                vehicleId: row.vehicle_id,
                distributorId: row.distributor_id,
                category: row.category,
                productId: row.product_id,
                allocatedQty: Number(row.allocated_qty),
              })),
            });
          }

          const allocationsChanged = !sameRowSet(
            existingAllocations,
            allocationRowsBase,
          );

          const hasChanges = allocationsChanged;

          /*
           * Optimistic concurrency gate.
           *
           * This MUST happen before modifying assignments/allocations.
           * Two concurrent requests may both have passed the initial
           * read-based timestamp check. Only one is allowed to atomically
           * claim the expected updated_at value.
           */
          if (hasChanges && dto.expectedUpdatedAt && existingPaper) {
            await assertNotStale(
              () =>
                this.vehicleAllocationRepository.touchVehicleAllocationPaperIfUnchanged(
                  existingPaper.id,
                  new Date(dto.expectedUpdatedAt!),
                  tx,
                ),
              STALE_DATA_MESSAGE,
            );
          }

          const vehicleAllocationPaper =
            existingPaper ??
            (await this.vehicleAllocationRepository.getOrCreateVehicleAllocationPaper(
              paperId,
              session,
              tx,
            ));

          const allocationRows = allocationRowsBase.map((row) => ({
            vehicle_allocation_paper_id: vehicleAllocationPaper.id,
            ...row,
          }));

          /*
           * No expectedUpdatedAt means this is an ordinary save.
           * Preserve F7: only bump updated_at when the data actually changed.
           */
          if (hasChanges && !dto.expectedUpdatedAt) {
            await tx.vehicle_allocation_paper.update({
              where: {
                id: vehicleAllocationPaper.id,
              },
              data: {},
            });
          }

          /*
           * These writes happen only after the optimistic-concurrency
           * check succeeds.
           */

          if (allocationsChanged) {
            await this.vehicleAllocationRepository.replaceVehicleAllocations(
              vehicleAllocationPaper.id,
              allocationRows,
              tx,
            );
          }

          return {
            success: true,
            changed: hasChanges,
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }
}

function sameRowSet(
  existing: {
    vehicle_id: number;
    distributor_id: number;
    category: string;
    product_id: number;
    allocated_qty: unknown;
  }[],
  incoming: {
    vehicle_id: number;
    distributor_id: number;
    category: string;
    product_id: number;
    allocated_qty: unknown;
  }[],
): boolean {
  if (existing.length !== incoming.length) {
    return false;
  }

  // FIX F1 (consistency review): identity part of this comparison key now
  // comes from the same `buildAllocationKey` used everywhere else; the
  // quantity is appended separately since this check (unlike a lookup key)
  // needs to detect a value change, not just identify a row.
  const toComparable = (row: (typeof existing)[number]) =>
    `${buildAllocationKey(row)}_${Number(row.allocated_qty)}`;

  const sortedExisting = existing.map(toComparable).sort();
  const sortedIncoming = incoming.map(toComparable).sort();

  return sortedExisting.every(
    (value, index) => value === sortedIncoming[index],
  );
}
