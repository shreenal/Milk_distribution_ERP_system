import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

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
import { DeliverySession, PricingUnit, Prisma } from '../../../generated/prisma/client.js';
import { DairyTraysRepository } from '../dairy-trays/dairy-trays.repository.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js'; // or wherever it currently lives

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
    private readonly trayCalculationService: TrayCalculationService,
    private readonly dairyTraysRepository: DairyTraysRepository,
  ) { }

  private rowKey(entry: {
    vehicle_id?: number;
    vehicleId?: number;
    distributor_id?: number;
    distributorId?: number;
    category: string;
    product_id?: number;
    productId?: number;
    delivery_session?: DeliverySession;
    deliverySession?: DeliverySession;
  }): string {
    const vehicleId = entry.vehicle_id ?? entry.vehicleId;
    const distributorId = entry.distributor_id ?? entry.distributorId;
    const productId = entry.product_id ?? entry.productId;
    const deliverySession = entry.delivery_session ?? entry.deliverySession;

    return `${vehicleId}_${distributorId}_${entry.category}_${productId}_${deliverySession}`;
  }

  // FIX F8: the entire read is now a single transaction (defaulting to
  // Prisma's `ReadCommitted`, upgraded to `RepeatableRead` here) so the
  // response is built from one consistent snapshot instead of ~7
  // sequential statements that could each observe a different committed
  // state if a save happens mid-read.
  async getPurchases(paperId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const paper = await this.purchaseRepository.findOrderPaperById(
          paperId,
          tx,
        );

        if (!paper) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
          );
        }

        const vehicleAssignments: VehicleAssignment[] =
          await this.purchaseRepository.findVehicleAssignmentsByPaperId(
            paperId,
            tx,
          );

        if (vehicleAssignments.length === 0) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.NO_VEHICLE_ASSIGNMENTS,
          );
        }

        const assignmentMap = buildVehicleAssignmentMap(vehicleAssignments);

        const workflow = this.workflowBuilder.buildPurchasesWorkflow(
          paper.status,
        );

        const orderItems =
          await this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
            paperId,
            tx,
          );

        const summaries = this.allocationSummaryBuilder.build(orderItems);

        const grids = this.purchaseBuilder.buildPurchaseGrids(
          summaries,
          vehicleAssignments,
        );

        const allocations =
          await this.purchaseRepository.findVehicleAllocationsByPaperId(
            paperId,
            tx,
          );

        if (allocations.length === 0) {
          throw new BadRequestException(
            PURCHASE_ERROR_MESSAGES.VEHICLE_ALLOCATIONS_REQUIRED,
          );
        }

        const allocationResult = this.purchaseBuilder.applyVehicleAllocations(
          grids,
          allocations,
        );

        const purchasePaper = await this.purchaseRepository.findPurchasePaper(
          paperId,
          tx,
        );

        const purchaseEntries = purchasePaper
          ? await this.purchaseRepository.findPurchaseEntries(
            purchasePaper.id,
            tx,
          )
          : [];

        // FIX F4: only resolve a LIVE default rate for allocation rows that
        // do NOT already have a saved purchase_entry. Rows that already
        // have an entry keep their frozen rate (applied below by
        // applyPurchaseEntries) and never touch the live rate table at
        // read time — so a lapsed/missing current rate can no longer break
        // reading historical data (previously this threw for the whole
        // endpoint).
        const purchasedRowKeys = new Set(
          purchaseEntries.map((entry) => this.rowKey(entry)),
        );

        const allocationsNeedingLiveRate = allocations.filter((allocation) => {
          if (allocation.vehicle_id == null || allocation.product_id == null) {
            throw new BadRequestException(
              PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
            );
          }
          return !purchasedRowKeys.has(
            this.rowKey({
              vehicle_id: allocation.vehicle_id,
              distributor_id: allocation.distributor_id,
              category: allocation.category,
              product_id: allocation.product_id,
              delivery_session:
                allocation.vehicle_allocation_paper.delivery_session,
            }),
          );
        });

        // Validate assignments up front (no query needed, already in memory)
        const validatedAllocations = allocationsNeedingLiveRate.map(
          (allocation) => {
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
            return allocation;
          },
        );

        // Batch-fetch product links
        const linkMap = await this.purchaseRepository.getProductLinksBatch(
          validatedAllocations.map((a) => ({
            distributorId: a.distributor_id,
            productId: a.product_id,
          })),
          tx,
          true,
        );

        // Compute gatepass dates and batch-fetch rates
        const rateRequests = validatedAllocations.map((allocation) => {
          const link = linkMap.get(
            `${allocation.distributor_id}_${allocation.product_id}`,
          );
          if (!link) {
            throw new BadRequestException(
              `No product link found for distributor ${allocation.distributor_id} and product ${allocation.product_id}`,
            );
          }
          const gatepassDate =
            this.purchaseCommercialService.resolveGatepassDateFor(
              paper.sale_date,
              allocation.master_product.master_brand.gatepass_date_policy,
            );
          return { productLinkId: link.id, effectiveDate: gatepassDate };
        });

        const rateMap =
          await this.purchaseRepository.findProductLinkRatesForDateBatch(
            rateRequests,
            tx,
          );

        const rateDefaults = validatedAllocations.map((allocation, i) => {
          const { productLinkId, effectiveDate } = rateRequests[i];
          const rate = rateMap.get(
            `${productLinkId}_${effectiveDate.toISOString()}`,
          );
          if (!rate) {
            throw new BadRequestException(
              `Rate not found for distributor ${allocation.distributor_id} product ${allocation.product_id} on ${effectiveDate.toISOString().slice(0, 10)}`,
            );
          }
          const pricingQuantity =
            allocation.master_product.product_order_unit?.pricing_quantity;

          if (!pricingQuantity || Number(pricingQuantity) <= 0) {
            throw new BadRequestException(
              `No order unit configuration found for product ${allocation.product_id}`,
            );
          }

          return {
            distributorId: allocation.distributor_id,
            category: allocation.category,
            vehicleId: allocation.vehicle_id,
            deliverySession:
              allocation.vehicle_allocation_paper.delivery_session,
            productId: allocation.product_id,
            purchaseRate: Number(rate.purchase_rate),
            pricingQuantity: Number(pricingQuantity),
          };
        });

        const rateResult = this.purchaseBuilder.applyPurchaseRates(
          allocationResult,
          rateDefaults,
        );

        // FIX F1/F2/F3: no more paper-level allocationChangedSincePurchase
        // gate — applyPurchaseEntries now always applies saved entries and
        // computes staleness per row (see purchase.builder.ts).
        const entriesResult = this.purchaseBuilder.applyPurchaseEntries(
          rateResult,
          purchaseEntries,
          allocations,
        );

        const finalResult = this.purchaseBuilder.applyVarianceMetadata(
          entriesResult,
          allocations,
          purchaseEntries,
        );

        // FIX F15: let the frontend distinguish "MORNING has nothing
        // required yet because it hasn't been allocated" from "MORNING was
        // allocated and genuinely has zero requirements".
        const morningAllocationPapers =
          await this.purchaseRepository.findVehicleAllocationPapersForOrderPaper(
            paperId,
            tx,
          );

        const morningAllocationPending = !morningAllocationPapers.some(
          (p) => p.delivery_session === DeliverySession.MORNING,
        );

        const hasStaleRows = entriesResult.purchases.some((purchase) =>
          purchase.rows.some((row) =>
            Object.entries(row).some(
              ([field, value]) => field.endsWith('_stale') && value === true,
            ),
          ),
        );

        return {
          paper,
          workflow,
          hasPurchaseEntries: purchaseEntries.length > 0,
          hasStaleRows,
          morningAllocationPending,
          orphanedEntries: entriesResult.orphanedEntries,
          // FIX F6: sent back so the frontend can echo it on save as
          // `expectedUpdatedAt` for optimistic concurrency.
          purchasePaperUpdatedAt: purchasePaper?.updated_at ?? null,
          purchases: finalResult.purchases,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async savePurchases(paperId: number, dto: SavePurchaseDto) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
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
            throw new BadRequestException(
              PURCHASE_ERROR_MESSAGES.EDIT_NOT_ALLOWED,
            );
          }

          this.purchaseValidationService.validateNoDuplicateEntries(
            dto.entries,
          );

          const existingPurchasePaper =
            await this.purchaseRepository.findPurchasePaper(paperId, tx);

          if (dto.expectedUpdatedAt) {
            if (!existingPurchasePaper) {
              throw new ConflictException(
                'Purchase data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.',
              );
            }

            const stillCurrent = await this.purchaseRepository.touchPurchasePaperIfUnchanged(
              existingPurchasePaper.id,
              new Date(dto.expectedUpdatedAt),
              tx,
            );

            if (!stillCurrent) {
              throw new ConflictException(
                'Purchase data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.',
              );
            }
          }

          await this.purchaseValidationService.validatePurchases(
            paperId,
            dto,
            tx,
          );

          const entries = dto.entries.filter((entry) => entry.purchasedQty > 0);

          const purchasePaper =
            existingPurchasePaper ??
            (await this.purchaseRepository.getOrCreatePurchasePaper(
              paperId,
              tx,
            ));

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
            if (
              allocation.vehicle_id == null ||
              allocation.product_id == null
            ) {
              throw new BadRequestException(
                PURCHASE_ERROR_MESSAGES.INVALID_ALLOCATION_IDENTIFIERS,
              );
            }

            allocationMap.set(
              `${allocation.vehicle_id}_${allocation.distributor_id}_${allocation.category}_${allocation.product_id}_${allocation.vehicle_allocation_paper.delivery_session}`,
              allocation,
            );
          }

          const existingEntries = purchasePaper.id
            ? await this.purchaseRepository.findPurchaseEntries(
              purchasePaper.id,
              tx,
            )
            : [];

          const existingEntryMap = new Map(
            existingEntries.map((entry) => [this.rowKey(entry), entry]),
          );

          const incomingKeys = new Set(
            entries.map((entry) =>
              this.rowKey({
                vehicleId: entry.vehicleId,
                distributorId: entry.distributorId,
                category: entry.category,
                productId: entry.productId,
                deliverySession: entry.deliverySession,
              }),
            ),
          );

          const entriesAboutToBeDropped = existingEntries.filter(
            (entry) => !incomingKeys.has(this.rowKey(entry)),
          );

          if (entriesAboutToBeDropped.length > 0 && !dto.confirmDeletions) {
            throw new BadRequestException({
              message:
                'Saving would remove existing purchase entries that are no longer part of the submitted data. Confirm deletion to proceed.',
              droppedEntries: entriesAboutToBeDropped.map((entry) => ({
                vehicleId: entry.vehicle_id,
                distributorId: entry.distributor_id,
                category: entry.category,
                productId: entry.product_id,
                deliverySession: entry.delivery_session,
                purchasedQty: Number(entry.purchased_qty),
              })),
            });
          }

          const validatedEntries = entries.map((entry) => {
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

            return { entry, allocation };
          });

          const trayRules =
            await this.dairyTraysRepository.getProductTrayRules(tx);

          const linkMap = await this.purchaseRepository.getProductLinksBatch(
            validatedEntries.map(({ entry }) => ({
              distributorId: entry.distributorId,
              productId: entry.productId,
            })),
            tx,
            true,
          );

          const rateRequests = validatedEntries.map(({ entry, allocation }) => {
            const link = linkMap.get(
              `${entry.distributorId}_${entry.productId}`,
            );
            if (!link) {
              throw new BadRequestException(
                `Distributor ${entry.distributorId} does not have an active product link for product ${entry.productId}`,
              );
            }
            const gatepassDate =
              this.purchaseCommercialService.resolveGatepassDateFor(
                paper.sale_date,
                allocation.master_product.master_brand.gatepass_date_policy,
              );
            return { productLinkId: link.id, effectiveDate: gatepassDate };
          });

          const rateMap =
            await this.purchaseRepository.findProductLinkRatesForDateBatch(
              rateRequests,
              tx,
            );

          const purchaseRows = validatedEntries.map(
            ({ entry, allocation }, i) => {
              const { productLinkId, effectiveDate } = rateRequests[i];
              const rate = rateMap.get(
                `${productLinkId}_${effectiveDate.toISOString()}`,
              );
              if (!rate) {
                throw new BadRequestException(
                  `Rate not found for distributor ${entry.distributorId} product ${entry.productId} on ${effectiveDate.toISOString().slice(0, 10)}`,
                );
              }

              const existingEntry = existingEntryMap.get(
                this.rowKey({
                  vehicleId: entry.vehicleId,
                  distributorId: entry.distributorId,
                  category: entry.category,
                  productId: entry.productId,
                  deliverySession: entry.deliverySession,
                }),
              );

              const purchaseRate = existingEntry
                ? Number(existingEntry.purchase_rate)
                : Number(rate.purchase_rate);

              let unitsPerOrderUnit: number;
              let pricingQuantity: number;
              let pricingUnit: PricingUnit;

              if (existingEntry) {
                unitsPerOrderUnit = existingEntry.units_per_order_unit;
                pricingQuantity = Number(existingEntry.pricing_quantity);
                pricingUnit = existingEntry.pricing_unit;
              } else {
                const orderUnit = allocation.master_product.product_order_unit;

                if (
                  !orderUnit ||
                  orderUnit.units_per_order_unit <= 0 ||
                  Number(orderUnit.pricing_quantity) <= 0
                ) {
                  throw new BadRequestException(
                    `No order unit configuration found for product ${entry.productId}`,
                  );
                }

                unitsPerOrderUnit = orderUnit.units_per_order_unit;
                pricingQuantity = Number(orderUnit.pricing_quantity);
                pricingUnit = orderUnit.pricing_unit;
              }

              const { purchaseAmount } = this.purchaseBillingService.calculate(
                Number(entry.purchasedQty),
                purchaseRate,
                pricingQuantity,
              );

              const trayTypeId = existingEntry
                ? this.trayCalculationService.resolveFrozenTrayTypeId(
                  existingEntry,
                  trayRules,
                )
                : (this.trayCalculationService.resolveTrayRule(
                  allocation.master_product,
                  trayRules,
                )?.tray_type_id ?? null);

              return {
                purchase_paper_id: purchasePaper.id,
                delivery_session: entry.deliverySession,
                distributor_id: entry.distributorId,
                category: entry.category,
                vehicle_id: entry.vehicleId,
                product_id: entry.productId,
                product_link_id: productLinkId,
                purchased_qty: entry.purchasedQty,
                purchase_rate: purchaseRate,
                purchase_amount: purchaseAmount,
                gatepass_date: effectiveDate,
                source_allocation_id: allocation.id,
                source_allocated_qty: allocation.allocated_qty,
                tray_type_id: trayTypeId,
                units_per_order_unit: unitsPerOrderUnit,
                pricing_quantity: pricingQuantity,
                pricing_unit: pricingUnit,
              };
            },
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

          return {
            success: true,
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
