import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PurchaseRepository } from './purchase.repository.js';
import { PurchaseBuilder } from './purchase.builder.js';
import { SavePurchaseDto } from './dto/purchase.dto.js';
import {
  ExplicitPurchaseEntry,
  PurchaseValidationService,
} from './services/purchase-validation.service.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import {
  PURCHASE_ERROR_MESSAGES as MSG,
  STALE_DATA_MESSAGE,
} from './purchase.constants.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PurchaseCommercialService } from './services/purchase-commercial.service.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { PurchaseRateDefault } from '../../../types/purchase.types.js';
import { DairyTraysRepository } from '../dairy-trays/dairy-trays.repository.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { buildPurchaseKey } from '../../../common/utils/allocation-key.util.js';
import { rateKey } from './purchase.util.js';

export type PurchaseActor = { id: number; role: string };

type LogEntry = { level: 'log' | 'warn'; payload: Record<string, unknown> };

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    private readonly purchaseRepository: PurchaseRepository,
    private readonly purchaseBuilder: PurchaseBuilder,
    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly purchaseValidationService: PurchaseValidationService,
    private readonly purchaseBillingService: PurchaseBillingService,
    private readonly purchaseCommercialService: PurchaseCommercialService,
    private readonly purchaseVarianceCalculator: PurchaseVarianceCalculator,
    private readonly workflowState: WorkflowStateService,
    private readonly workflowBuilder: WorkflowBuilder,
    private readonly prisma: PrismaService,
    private readonly dependencyOrchestrator: DependencyOrchestratorService,
    private readonly trayCalculationService: TrayCalculationService,
    private readonly dairyTraysRepository: DairyTraysRepository,
  ) {}

  // ---------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------

  async getPurchases(paperId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const paper = await this.purchaseRepository.findOrderPaperById(
          paperId,
          tx,
        );
        if (!paper) {
          throw new NotFoundException(MSG.ORDER_PAPER_NOT_FOUND);
        }

        const workflow = this.workflowBuilder.buildPurchasesWorkflow(
          paper.status,
        );

        const orderItems =
          await this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
            paperId,
            tx,
          );
        const summaries = this.allocationSummaryBuilder.build(orderItems);
        const allocations =
          await this.purchaseRepository.findVehicleAllocationsByPaperId(
            paperId,
            tx,
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

        const grids = this.purchaseBuilder.applyVehicleAllocations(
          this.purchaseBuilder.buildPurchaseGrids(summaries, allocations),
          allocations,
        );

        // Live default rates only for cells that are not saved (saved cells are FROZEN).
        const savedKeys = new Set(
          purchaseEntries.map((e) => buildPurchaseKey(e)),
        );
        const allocKey = (a: (typeof allocations)[number]) =>
          buildPurchaseKey({
            vehicleId: a.vehicle_id,
            distributorId: a.distributor_id,
            category: a.category,
            productId: a.product_id,
            deliverySession: a.vehicle_allocation_paper.delivery_session,
          });
        const unsaved = allocations.filter((a) => !savedKeys.has(allocKey(a)));

        const linkMap =
          unsaved.length > 0
            ? await this.purchaseRepository.getProductLinksBatch(
                unsaved.map((a) => ({
                  distributorId: a.distributor_id,
                  productId: a.product_id,
                })),
                tx,
                true,
              )
            : new Map();

        const requests = unsaved.flatMap((a) => {
          const link = linkMap.get(`${a.distributor_id}_${a.product_id}`);
          return link
            ? [
                {
                  productLinkId: link.id,
                  effectiveDate:
                    this.purchaseCommercialService.resolveGatepassDateFor(
                      paper.sale_date,
                      a.master_product.master_brand.gatepass_date_policy,
                    ),
                },
              ]
            : [];
        });
        const rateMap =
          await this.purchaseRepository.findProductLinkRatesForDateBatch(
            requests,
            tx,
          );

        // PD-48: a problem with one cell never fails the whole screen.
        const rateDefaults: PurchaseRateDefault[] = unsaved.map((a) => {
          const base = {
            distributorId: a.distributor_id,
            category: a.category,
            vehicleId: a.vehicle_id,
            productId: a.product_id,
            deliverySession: a.vehicle_allocation_paper.delivery_session,
          };
          const missing = (
            issue: PurchaseRateDefault['rateIssue'],
          ): PurchaseRateDefault => ({
            ...base,
            purchaseRate: null,
            pricingQuantity: null,
            rateStatus: 'MISSING_CONFIGURATION',
            rateIssue: issue,
          });

          const link = linkMap.get(`${a.distributor_id}_${a.product_id}`);
          if (!link) return missing('NO_ACTIVE_LINK');

          const date = this.purchaseCommercialService.resolveGatepassDateFor(
            paper.sale_date,
            a.master_product.master_brand.gatepass_date_policy,
          );
          const rate = rateMap.get(rateKey(link.id, date));
          if (!rate) return missing('NO_RATE');

          const pricingQuantity =
            a.master_product.product_order_unit?.pricing_quantity;
          if (!pricingQuantity || Number(pricingQuantity) <= 0)
            return missing('NO_ORDER_UNIT');

          return {
            ...base,
            purchaseRate: Number(rate.purchase_rate),
            pricingQuantity: Number(pricingQuantity),
            rateStatus: 'OK',
          };
        });

        const rated = this.purchaseBuilder.applyPurchaseRates(
          grids,
          rateDefaults,
        );
        const withEntries = this.purchaseBuilder.applyPurchaseEntries(
          rated,
          purchaseEntries,
          allocations,
        );
        const { hasCriticalShortfall } =
          this.purchaseBuilder.applyVarianceMetadata(
            withEntries,
            allocations,
            purchaseEntries,
          );
        const totals = this.purchaseBuilder.applyPurchaseTotals(withEntries);

        const hasStaleRows = withEntries.purchases.some((p) =>
          p.rows.some((row) =>
            Object.entries(row).some(
              ([f, v]) => f.endsWith('_stale') && v === true,
            ),
          ),
        );

        // PD-47: morning demand exists but no active morning allocation rows.
        const morningDemand = orderItems.some(
          (i) =>
            i.deliverySession === DeliverySession.MORNING && i.orderedQty > 0,
        );
        const hasMorningAllocation = allocations.some(
          (a) =>
            a.vehicle_allocation_paper.delivery_session ===
              DeliverySession.MORNING && Number(a.allocated_qty) > 0,
        );

        const noAllocations = !allocations.some(
          (a) => Number(a.allocated_qty) > 0,
        );

        return {
          workflow,
          // PD-31 / PD-32: amounts are tax-exclusive; GST is never applied to purchases.
          taxExclusive: true,
          gstApplied: false,
          hasPurchaseEntries: purchaseEntries.length > 0,
          hasStaleRows,
          hasCriticalShortfall,
          morningAllocationPending: morningDemand && !hasMorningAllocation,
          // PD-38: with no allocation the screen is empty and needs a sign-off.
          zeroAllocation: {
            noAllocations,
            signedOffAt: purchasePaper?.signed_off_at ?? null,
            signOffRequired: noAllocations && !purchasePaper?.signed_off_at,
          },
          orphanedEntries: withEntries.orphanedEntries,
          purchasePaperUpdatedAt: purchasePaper?.updated_at ?? null,
          totals: {
            estimatedTotalAmount: totals.estimatedTotalAmount,
            // every saved entry, including orphans
            persistedTotalAmount: this.purchaseBuilder.sumAmounts(
              purchaseEntries.map((e) => e.purchase_amount),
            ),
          },
          purchases: withEntries.purchases,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
      },
    );
  }

  // ---------------------------------------------------------------------
  // Save (partial upsert + explicit deletes, PD-5 / PD-11)
  // ---------------------------------------------------------------------

  private parseExpected(expected: string | null): Date | null {
    if (expected === null) return null;
    const date = new Date(expected);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(MSG.INVALID_EXPECTED_UPDATED_AT);
    }
    return date;
  }

  /** PD-12: null matches only while no purchase paper exists; otherwise it must equal the token. */
  private assertTokenMatches(
    existing: { updated_at: Date } | null,
    expected: string | null,
  ) {
    const exp = this.parseExpected(expected);
    const ok =
      exp === null
        ? existing === null
        : existing !== null && existing.updated_at.getTime() === exp.getTime();
    if (!ok) throw new ConflictException(STALE_DATA_MESSAGE);
  }

  async savePurchases(
    paperId: number,
    dto: SavePurchaseDto,
    actor: PurchaseActor,
  ) {
    const isAdmin = actor.role === 'ADMIN';

    if (dto.purgeAll) {
      if (!isAdmin) throw new ForbiddenException(MSG.PURGE_FORBIDDEN);
      if (dto.purgeScope !== 'PAPER')
        throw new BadRequestException(MSG.PURGE_SCOPE_REQUIRED);
      if (
        dto.entries.length > 0 ||
        (dto.deletedEntryIds?.length ?? 0) > 0 ||
        dto.reevaluateTrays
      )
        throw new BadRequestException(MSG.PURGE_CONFLICT);
    }
    if (dto.reevaluateTrays && !isAdmin) {
      throw new ForbiddenException(MSG.REEVALUATE_FORBIDDEN);
    }

    // PD-39: null / blank / omitted quantity = no entry.
    const explicit = dto.entries.filter(
      (e): e is ExplicitPurchaseEntry =>
        e.purchasedQty !== undefined && e.purchasedQty !== null,
    );

    const outcome = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const logs: LogEntry[] = []; // written after commit, so a retry never duplicates them (PD-19)

          const paper = await this.purchaseRepository.findOrderPaperById(
            paperId,
            tx,
          );
          if (!paper) throw new NotFoundException(MSG.ORDER_PAPER_NOT_FOUND);

          // PD-52
          if (!this.workflowState.canEditPurchases(paper.status)) {
            throw new BadRequestException(MSG.EDIT_NOT_ALLOWED);
          }

          const existingPaper = await this.purchaseRepository.findPurchasePaper(
            paperId,
            tx,
          );
          this.assertTokenMatches(existingPaper, dto.expectedUpdatedAt);

          const existingEntries = existingPaper
            ? await this.purchaseRepository.findPurchaseEntries(
                existingPaper.id,
                tx,
              )
            : [];

          const requestedDeletes = dto.purgeAll
            ? existingEntries.map((e) => e.id)
            : [...new Set(dto.deletedEntryIds ?? [])];

          // PD-9: an empty save never deletes anything by itself.
          if (
            !dto.purgeAll &&
            dto.entries.length === 0 &&
            existingEntries.length > 0 &&
            requestedDeletes.length === 0 &&
            !dto.reevaluateTrays
          ) {
            throw new BadRequestException({
              message: MSG.EMPTY_ENTRIES_GUARDED,
              details: [MSG.EMPTY_ENTRIES_GUARDED],
            });
          }

          const existingById = new Map(existingEntries.map((e) => [e.id, e]));
          const unknownIds = requestedDeletes.filter(
            (id) => !existingById.has(id),
          );
          if (unknownIds.length > 0) {
            throw new BadRequestException({
              message: MSG.INVALID_ENTRIES,
              details: [MSG.DELETE_ID_UNKNOWN(unknownIds)],
            });
          }
          const deleteIds = new Set(requestedDeletes);
          const deletedKeys = new Set(
            requestedDeletes.map((id) =>
              buildPurchaseKey(existingById.get(id)!),
            ),
          );

          const allocations =
            await this.purchaseRepository.findVehicleAllocationsByPaperId(
              paperId,
              tx,
            );

          const { accepted, ignored, linkMap } =
            await this.purchaseValidationService.evaluateEntries({
              entries: explicit,
              allocations,
              existingEntries,
              deletedKeys,
              db: tx,
            });

          const trayRules =
            await this.dairyTraysRepository.getProductTrayRules(tx);

          // PD-34: admin re-evaluation of tray types over the whole sheet.
          const trayOverrides = new Map<number, number | null>();
          if (dto.reevaluateTrays) {
            for (const e of existingEntries) {
              if (deleteIds.has(e.id)) continue;
              const next =
                this.trayCalculationService.resolveTrayRule(
                  e.master_product,
                  trayRules,
                )?.tray_type_id ?? null;
              if (next !== e.tray_type_id) trayOverrides.set(e.id, next);
            }
          }

          // ---- price new rows (live), keep existing rows frozen (PD-20 / PD-21) ----
          const newOnes = accepted.filter((a) => !a.existing);
          const contexts = new Map<
            string,
            { productLinkId: number; effectiveDate: Date }
          >();
          for (const a of newOnes) {
            const link = linkMap.get(
              `${a.entry.distributorId}_${a.entry.productId}`,
            )!;
            contexts.set(a.key, {
              productLinkId: link.id,
              effectiveDate:
                this.purchaseCommercialService.resolveGatepassDateFor(
                  paper.sale_date,
                  a.allocation.master_product.master_brand.gatepass_date_policy,
                ),
            });
          }
          const rateMap =
            await this.purchaseRepository.findProductLinkRatesForDateBatch(
              [...contexts.values()],
              tx,
            );

          type Insert = Omit<
            Prisma.purchase_entryCreateManyInput,
            'purchase_paper_id'
          >;
          const inserts: Insert[] = [];
          const updates: {
            id: number;
            data: Prisma.purchase_entryUncheckedUpdateInput;
          }[] = [];
          const trayLogs: Record<string, unknown>[] = [];
          const pricingProblems: string[] = [];
          const shortfallWarnings: Record<string, unknown>[] = [];

          for (const a of accepted) {
            const { entry, allocation, existing } = a;

            const variance = this.purchaseVarianceCalculator.calculate(
              Number(allocation.allocated_qty),
              entry.purchasedQty,
            );
            if (variance.shortfallWarning) {
              shortfallWarnings.push({
                entry: a.label,
                allocatedQty: Number(allocation.allocated_qty),
                purchasedQty: entry.purchasedQty,
                signedVariancePercentage: variance.signedVariancePercentage,
                severity: variance.severity,
              });
            }

            if (existing) {
              const amount = this.purchaseBillingService.calculate(
                entry.purchasedQty,
                Number(existing.purchase_rate),
                Number(existing.pricing_quantity),
              ).purchaseAmount;

              // PD-33: tray type stays frozen; an empty one is resolved once and kept.
              const trayTypeId = trayOverrides.has(existing.id)
                ? trayOverrides.get(existing.id)!
                : this.trayCalculationService.resolveFrozenTrayTypeId(
                    existing,
                    trayRules,
                  );

              const changed =
                Number(existing.purchased_qty) !== entry.purchasedQty ||
                Number(existing.purchase_amount) !== amount ||
                existing.source_allocation_id !== allocation.id ||
                Number(existing.source_allocated_qty ?? NaN) !==
                  Number(allocation.allocated_qty) ||
                (existing.tray_type_id ?? null) !== trayTypeId;

              if (changed) {
                updates.push({
                  id: existing.id,
                  data: {
                    purchased_qty: entry.purchasedQty,
                    purchase_amount: amount,
                    source_allocation_id: allocation.id,
                    source_allocated_qty: allocation.allocated_qty,
                    tray_type_id: trayTypeId,
                  },
                });
              }
              if (trayOverrides.has(existing.id)) {
                trayLogs.push({
                  entryId: existing.id,
                  oldTrayTypeId: existing.tray_type_id,
                  newTrayTypeId: trayTypeId,
                });
              }
              continue;
            }

            const ctx = contexts.get(a.key)!;
            const rate = rateMap.get(
              rateKey(ctx.productLinkId, ctx.effectiveDate),
            );
            const orderUnit = allocation.master_product.product_order_unit;
            const orderUnitOk =
              !!orderUnit &&
              orderUnit.units_per_order_unit > 0 &&
              Number(orderUnit.pricing_quantity) > 0;

            if (!rate || !orderUnitOk) {
              if (entry.purchasedQty === 0) {
                // PD-48: not stored (the rate column is mandatory); the cell shows MISSING_CONFIGURATION.
                ignored.push({
                  vehicleId: entry.vehicleId,
                  deliverySession: entry.deliverySession,
                  distributorId: entry.distributorId,
                  category: entry.category,
                  productId: entry.productId,
                  reason: 'MISSING_CONFIGURATION',
                });
              } else if (!rate) {
                pricingProblems.push(
                  MSG.RATE_MISSING(
                    a.label,
                    ctx.effectiveDate.toISOString().slice(0, 10),
                  ),
                );
              } else {
                pricingProblems.push(MSG.ORDER_UNIT_MISSING(a.label));
              }
              continue;
            }

            const pricingQuantity = Number(orderUnit!.pricing_quantity);
            inserts.push({
              delivery_session: entry.deliverySession,
              distributor_id: entry.distributorId,
              category: entry.category,
              vehicle_id: entry.vehicleId,
              product_id: entry.productId,
              product_link_id: ctx.productLinkId,
              purchased_qty: entry.purchasedQty,
              purchase_rate: Number(rate.purchase_rate),
              purchase_amount: this.purchaseBillingService.calculate(
                entry.purchasedQty,
                Number(rate.purchase_rate),
                pricingQuantity,
              ).purchaseAmount,
              gatepass_date: ctx.effectiveDate,
              source_allocation_id: allocation.id,
              source_allocated_qty: allocation.allocated_qty,
              tray_type_id:
                this.trayCalculationService.resolveTrayRule(
                  allocation.master_product,
                  trayRules,
                )?.tray_type_id ?? null,
              units_per_order_unit: orderUnit!.units_per_order_unit,
              pricing_quantity: pricingQuantity,
              pricing_unit: orderUnit!.pricing_unit,
            });
          }

          if (pricingProblems.length > 0) {
            throw new BadRequestException({
              message: MSG.INVALID_ENTRIES,
              details: pricingProblems,
            });
          }

          // Tray re-evaluation for entries that are not part of this save's payload.
          const handled = new Set(accepted.map((a) => a.existing?.id));
          const trayOnly: { id: number; tray: number | null }[] = [];
          for (const [id, tray] of trayOverrides) {
            if (handled.has(id)) continue;
            trayOnly.push({ id, tray });
            trayLogs.push({
              entryId: id,
              oldTrayTypeId: existingById.get(id)!.tray_type_id,
              newTrayTypeId: tray,
            });
          }

          const entriesChanged =
            inserts.length + updates.length + trayOnly.length + deleteIds.size >
            0;

          if (shortfallWarnings.length > 0) {
            logs.push({
              level: 'warn',
              payload: {
                action: 'PURCHASE_CRITICAL_SHORTFALL',
                paperId,
                userId: actor.id,
                reason: dto.shortfallComment ?? null,
                newValues: shortfallWarnings,
              },
            });
          }

          if (!entriesChanged) {
            return {
              logs,
              response: {
                success: true,
                changed: false,
                purchasePaperUpdatedAt:
                  existingPaper?.updated_at.toISOString() ?? null,
                deletedEntryIds: [] as number[],
                ignoredEntries: ignored,
                shortfallWarnings,
              },
            };
          }

          // Advance the token (first save creates the header), then write.
          let paperId_: number;
          let token: Date;
          if (existingPaper) {
            const touch =
              await this.purchaseRepository.touchPurchasePaperIfTokenMatches(
                existingPaper.id,
                this.parseExpected(dto.expectedUpdatedAt)!,
                tx,
              );
            if (touch.count !== 1)
              throw new ConflictException(STALE_DATA_MESSAGE);
            paperId_ = existingPaper.id;
            token = touch.touchedAt;
          } else {
            const created = await this.purchaseRepository.createPurchasePaper(
              paperId,
              undefined,
              tx,
            );
            paperId_ = created.id;
            token = created.updated_at;
          }

          await this.purchaseRepository.deletePurchaseEntriesByIds(
            paperId_,
            [...deleteIds],
            tx,
          );
          for (const u of updates)
            await this.purchaseRepository.updatePurchaseEntry(u.id, u.data, tx);
          for (const t of trayOnly)
            await this.purchaseRepository.updatePurchaseEntry(
              t.id,
              { tray_type_id: t.tray },
              tx,
            );
          await this.purchaseRepository.createPurchaseEntries(
            inserts.map(
              (r) =>
                ({
                  ...r,
                  purchase_paper_id: paperId_,
                }) as Prisma.purchase_entryCreateManyInput,
            ),
            tx,
          );

          // Dairy-tray recalculation rebuilds from current state, so a retry is idempotent (PD-19).
          await this.dependencyOrchestrator.execute(
            DEPENDENCY_MODULES.PURCHASE,
            DEPENDENCY_TRIGGERS.ON_SAVE,
            { paperId, tx },
          );

          if (deleteIds.size > 0) {
            logs.push({
              level: 'log',
              payload: {
                action: dto.purgeAll
                  ? 'PURCHASE_PURGE_ALL'
                  : 'PURCHASE_DELETE_ENTRIES',
                paperId,
                userId: actor.id,
                reason: dto.reason ?? null,
                oldValues: [...deleteIds].map((id) => {
                  const e = existingById.get(id)!;
                  return {
                    entryId: id,
                    key: buildPurchaseKey(e),
                    purchasedQty: Number(e.purchased_qty),
                    purchaseAmount: Number(e.purchase_amount),
                  };
                }),
              },
            });
          }
          if (trayLogs.length > 0) {
            logs.push({
              level: 'log',
              payload: {
                action: 'PURCHASE_TRAY_REEVALUATION',
                paperId,
                userId: actor.id,
                reason: dto.reason ?? null,
                newValues: trayLogs,
              },
            });
          }

          return {
            logs,
            response: {
              success: true,
              changed: true,
              purchasePaperUpdatedAt: token.toISOString(),
              deletedEntryIds: [...deleteIds],
              ignoredEntries: ignored,
              shortfallWarnings,
            },
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    for (const l of outcome.logs)
      this.logger[l.level](JSON.stringify(l.payload));
    return outcome.response;
  }
}
