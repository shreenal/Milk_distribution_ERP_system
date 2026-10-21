import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PurchaseRepository } from '../purchase.repository.js';
import { PurchaseBillingService } from './purchase-billing.service.js';
import { PurchaseCommercialService } from './purchase-commercial.service.js';
import { WorkflowStateService } from '../../workflow/workflow-state.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { withSerializableRetry } from '../../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../../common/prisma/transaction.constants.js';
import { OrderPaperStatus } from '../../../../generated/prisma/client.js';
import {
  PURCHASE_ERROR_MESSAGES as MSG,
  STALE_DATA_MESSAGE,
} from '../purchase.constants.js';
import { rateKey } from '../purchase.util.js';
import {
  describeProduct,
  describeVehicle,
} from '../../vehicle-allocation/vehicle-allocation.util.js';
import { RecalculatePurchaseRatesDto } from '../dto/recalculate-purchase-rates.dto.js';
import { SignOffZeroAllocationDto } from '../dto/sign-off-zero-allocation.dto.js';
import { PurchaseActor } from '../purchase.service.js';
import { DairyTraysRepository } from '../../dairy-trays/dairy-trays.repository.js';

@Injectable()
export class PurchaseAdminService {
  private readonly logger = new Logger(PurchaseAdminService.name);

  constructor(
    private readonly repository: PurchaseRepository,
    private readonly billing: PurchaseBillingService,
    private readonly commercial: PurchaseCommercialService,
    private readonly dairyTraysRepository: DairyTraysRepository,
    private readonly workflowState: WorkflowStateService,
    private readonly prisma: PrismaService,
  ) {}

  private assertToken(
    existing: { updated_at: Date } | null,
    expected: string | null,
  ) {
    let exp: Date | null = null;
    if (expected !== null) {
      exp = new Date(expected);
      if (Number.isNaN(exp.getTime())) {
        throw new BadRequestException(MSG.INVALID_EXPECTED_UPDATED_AT);
      }
    }
    const ok =
      exp === null
        ? existing === null
        : existing !== null && existing.updated_at.getTime() === exp.getTime();
    if (!ok) throw new ConflictException(STALE_DATA_MESSAGE);
    return exp;
  }

  /**
   * PD-23 to PD-25: ADMIN-only, REOPENED papers only, whole paper, all-or-nothing.
   * Refreshes link, rate, gatepass date and the order-unit snapshot of every
   * saved entry. Old and new values are logged (no audit table).
   */
  async recalculateRates(
    paperId: number,
    dto: RecalculatePurchaseRatesDto,
    actor: PurchaseActor,
  ) {
    const outcome = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const paper = await this.repository.findOrderPaperById(paperId, tx);
          if (!paper) throw new NotFoundException(MSG.ORDER_PAPER_NOT_FOUND);
          if (paper.status !== OrderPaperStatus.REOPENED) {
            throw new BadRequestException(MSG.RECALC_ONLY_REOPENED);
          }

          const header = await this.repository.findPurchasePaper(paperId, tx);
          const expected = this.assertToken(header, dto.expectedUpdatedAt);
          const noChange = {
            changes: [] as Record<string, unknown>[],
            response: {
              success: true,
              changed: false,
              purchasePaperUpdatedAt: header?.updated_at.toISOString() ?? null,
              recalculatedEntries: 0,
            },
          };
          if (!header) return noChange;

          const entries = await this.repository.findEntriesForRecalculation(
            header.id,
            tx,
          );
          if (entries.length === 0) return noChange;

          const linkMap = await this.repository.getProductLinksBatch(
            entries.map((e) => ({
              distributorId: e.distributor_id,
              productId: e.product_id,
            })),
            tx,
            true,
          );
          const dateOf = (e: (typeof entries)[number]) =>
            this.commercial.resolveGatepassDateFor(
              paper.sale_date,
              e.master_product.master_brand.gatepass_date_policy,
            );
          const rateMap =
            await this.repository.findProductLinkRatesForDateBatch(
              entries.flatMap((e) => {
                const link = linkMap.get(`${e.distributor_id}_${e.product_id}`);
                return link
                  ? [{ productLinkId: link.id, effectiveDate: dateOf(e) }]
                  : [];
              }),
              tx,
            );

          const problems: string[] = [];
          const updates: { id: number; data: Record<string, unknown> }[] = [];
          const changes: Record<string, unknown>[] = [];

          for (const e of entries) {
            const label = `${describeVehicle(e.master_vehicle)} / ${e.distributor.name} (${e.category}) / ${describeProduct(e.master_product)} (${e.delivery_session})`;
            const link = linkMap.get(`${e.distributor_id}_${e.product_id}`);
            if (!link) {
              problems.push(
                MSG.LINK_MISSING(
                  e.distributor.name,
                  describeProduct(e.master_product),
                ),
              );
              continue;
            }
            const date = dateOf(e);
            const rate = rateMap.get(rateKey(link.id, date));
            if (!rate) {
              problems.push(
                MSG.RATE_MISSING(label, date.toISOString().slice(0, 10)),
              );
              continue;
            }
            const unit = e.master_product.product_order_unit;
            if (
              !unit ||
              unit.units_per_order_unit <= 0 ||
              Number(unit.pricing_quantity) <= 0
            ) {
              problems.push(MSG.ORDER_UNIT_MISSING(label));
              continue;
            }

            const next = {
              product_link_id: link.id,
              gatepass_date: date,
              purchase_rate: Number(rate.purchase_rate),
              purchase_amount: this.billing.calculate(
                Number(e.purchased_qty),
                Number(rate.purchase_rate),
                Number(unit.pricing_quantity),
              ).purchaseAmount,
              units_per_order_unit: unit.units_per_order_unit,
              pricing_quantity: Number(unit.pricing_quantity),
              pricing_unit: unit.pricing_unit,
            };
            const old = {
              product_link_id: e.product_link_id,
              gatepass_date: e.gatepass_date,
              purchase_rate: Number(e.purchase_rate),
              purchase_amount: Number(e.purchase_amount),
              units_per_order_unit: e.units_per_order_unit,
              pricing_quantity: Number(e.pricing_quantity),
              pricing_unit: e.pricing_unit,
            };
            if (JSON.stringify(old) !== JSON.stringify(next)) {
              updates.push({ id: e.id, data: next });
              changes.push({
                entryId: e.id,
                entry: label,
                oldValues: old,
                newValues: next,
              });
            }
          }

          // all-or-nothing (PD-24)
          if (problems.length > 0) {
            throw new BadRequestException({
              message: MSG.RECALC_FAILED,
              details: problems,
            });
          }
          if (updates.length === 0) return noChange;

          const touch = await this.repository.touchPurchasePaperIfTokenMatches(
            header.id,
            expected!,
            tx,
          );
          if (touch.count !== 1)
            throw new ConflictException(STALE_DATA_MESSAGE);

          for (const u of updates) {
            await this.repository.updatePurchaseEntry(u.id, u.data, tx);
          }

          return {
            changes,
            response: {
              success: true,
              changed: true,
              purchasePaperUpdatedAt: touch.touchedAt.toISOString(),
              recalculatedEntries: updates.length,
            },
          };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    // logged after commit so a serialization retry never logs twice
    for (const c of outcome.changes) {
      this.logger.log(
        JSON.stringify({
          action: 'PURCHASE_RATE_RECALCULATION',
          paperId,
          userId: actor.id,
          reason: dto.reason,
          ...c,
        }),
      );
    }
    return outcome.response;
  }

  /** PD-38: confirms "no purchases" for a paper with no allocation at all. */
  async signOffZeroAllocation(
    paperId: number,
    dto: SignOffZeroAllocationDto,
    actor: PurchaseActor,
  ) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const paper = await this.repository.findOrderPaperById(paperId, tx);
          if (!paper) throw new NotFoundException(MSG.ORDER_PAPER_NOT_FOUND);
          if (!this.workflowState.canEditPurchases(paper.status)) {
            throw new BadRequestException(MSG.EDIT_NOT_ALLOWED);
          }

          const allocations =
            await this.repository.findVehicleAllocationsByPaperId(paperId, tx);
          if (allocations.some((a) => Number(a.allocated_qty) > 0)) {
            throw new BadRequestException(MSG.SIGNOFF_ALLOCATIONS_EXIST);
          }

          const header = await this.repository.findPurchasePaper(paperId, tx);
          const expected = this.assertToken(header, dto.expectedUpdatedAt);

          await this.dairyTraysRepository.getOrCreateDairyTrayPaper(
            paperId,
            tx,
          );

          if (header?.signed_off_at) {
            return {
              success: true,
              changed: false,
              purchasePaperUpdatedAt: header.updated_at.toISOString(),
              signedOffAt: header.signed_off_at,
            };
          }

          const at = new Date();
          if (header) {
            const touch =
              await this.repository.touchPurchasePaperIfTokenMatches(
                header.id,
                expected!,
                tx,
              );
            if (touch.count !== 1)
              throw new ConflictException(STALE_DATA_MESSAGE);
            await this.repository.recordSignOff(
              header.id,
              actor.id,
              at,
              touch.touchedAt,
              tx,
            );
            return {
              success: true,
              changed: true,
              purchasePaperUpdatedAt: touch.touchedAt.toISOString(),
              signedOffAt: at,
            };
          }

          const created = await this.repository.createPurchasePaper(
            paperId,
            { at, by: actor.id },
            tx,
          );
          return {
            success: true,
            changed: true,
            purchasePaperUpdatedAt: created.updated_at.toISOString(),
            signedOffAt: at,
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
