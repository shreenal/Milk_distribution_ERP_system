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
import {
  DeliverySession,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';

@Injectable()
export class VehicleAllocationService {
  constructor(
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,

    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,

    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,

    private readonly orderItemsRepository: OrderItemsRepository,

    private readonly vehicleAllocationValidationService: VehicleAllocationValidationService,

    private readonly workflowState: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,

    private readonly prisma: PrismaService,
  ) { }

  private async getGroupSummary(
    paperId: number,
    session: DeliverySession,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const orderItems =
      await this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
        paperId,
        db,
      );

    return this.allocationSummaryBuilder.build(orderItems, session);
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

      const [summaries, vehicles, distributors] = await Promise.all([
        this.getGroupSummary(paperId, session, tx),
        this.vehicleAllocationRepository.findVehicles(tx),
        this.vehicleAllocationRepository.findDistributors(tx),
      ]);

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

      const requirementGrids =
        this.vehicleAllocationBuilder.buildVehicleRequirementGrids(summaries);

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
          paper,
          workflow,
          ...allocationGrids,
          requirementGrids,
          vehicleAssignments: assignmentGrid,
          vehicleAllocationPaperUpdatedAt: null,
        };
      }

      const [savedAllocations, savedAssignments] = await Promise.all([
        this.vehicleAllocationRepository.findVehicleAllocations(
          vehicleAllocationPaper.id,
          tx,
        ),
        this.vehicleAllocationRepository.findVehicleAssignments(
          vehicleAllocationPaper.id,
          tx,
        ),
      ]);

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
        paper,
        workflow,
        ...allocationResult,
        requirementGrids,
        vehicleAssignments: assignmentResult,
        vehicleAllocationPaperUpdatedAt: vehicleAllocationPaper.updated_at,
      };
    });
  }

  async saveVehicleAllocations(
    paperId: number,
    dto: SaveVehicleAllocationDto,
  ) {
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
          const session =
            this.workflowState.getActiveExecutionSession(status);

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

          // Fast sequential stale-read check.
          // The atomic check below is still required for genuine concurrency.
          if (
            dto.expectedUpdatedAt &&
            existingPaper &&
            new Date(dto.expectedUpdatedAt).getTime() !==
            existingPaper.updated_at.getTime()
          ) {
            throw new ConflictException(
              'Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.',
            );
          }

          await this.vehicleAllocationValidationService.validateVehicleAssignments(
            paperId,
            dto,
            tx,
          );

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

          const vehicleAllocationPaper =
            await this.vehicleAllocationRepository.getOrCreateVehicleAllocationPaper(
              paperId,
              session,
              tx,
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

          const allocationRows = dto.allocations
            .filter((allocation) => allocation.allocatedQty > 0)
            .map((allocation) => ({
              vehicle_allocation_paper_id: vehicleAllocationPaper.id,
              vehicle_id: allocation.vehicleId,
              distributor_id: allocation.distributorId,
              category: allocation.category,
              product_id: allocation.productId,
              allocated_qty: allocation.allocatedQty,
            }));

          const existingAssignments = existingPaper
            ? await this.vehicleAllocationRepository.findVehicleAssignments(
              existingPaper.id,
              tx,
            )
            : [];

          const existingAllocations = existingPaper
            ? await this.vehicleAllocationRepository.findVehicleAllocations(
              existingPaper.id,
              tx,
            )
            : [];

          const assignmentsChanged = !sameRowSet(
            existingAssignments.map(
              (a) =>
                `${a.vehicle_id}_${a.category}_${a.distributor_id}`,
            ),
            assignmentRows.map(
              (a) =>
                `${a.vehicle_id}_${a.category}_${a.distributor_id}`,
            ),
          );

          const allocationsChanged = !sameRowSet(
            existingAllocations.map(
              (a) =>
                `${a.vehicle_id}_${a.distributor_id}_${a.category}_${a.product_id}_${Number(a.allocated_qty)}`,
            ),
            allocationRows.map(
              (a) =>
                `${a.vehicle_id}_${a.distributor_id}_${a.category}_${a.product_id}_${Number(a.allocated_qty)}`,
            ),
          );

          const hasChanges =
            assignmentsChanged || allocationsChanged;

          /*
           * Optimistic concurrency gate.
           *
           * This MUST happen before modifying assignments/allocations.
           * Two concurrent requests may both have passed the initial
           * read-based timestamp check. Only one is allowed to atomically
           * claim the expected updated_at value.
           */
          if (hasChanges && dto.expectedUpdatedAt && existingPaper) {
            const result =
              await this.vehicleAllocationRepository
                .touchVehicleAllocationPaperIfUnchanged(
                  vehicleAllocationPaper.id,
                  new Date(dto.expectedUpdatedAt),
                  tx,
                );

            if (result.count !== 1) {
              throw new ConflictException(
                'Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.',
              );
            }
          }

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
          if (assignmentsChanged) {
            await this.vehicleAllocationRepository.replaceVehicleAssignments(
              vehicleAllocationPaper.id,
              assignmentRows,
              tx,
            );
          }

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

function sameRowSet(existing: string[], incoming: string[]): boolean {
  if (existing.length !== incoming.length) {
    return false;
  }

  const sortedExisting = [...existing].sort();
  const sortedIncoming = [...incoming].sort();

  return sortedExisting.every(
    (value, index) => value === sortedIncoming[index],
  );
}
