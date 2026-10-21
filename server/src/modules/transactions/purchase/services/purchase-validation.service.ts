import { BadRequestException, Injectable } from '@nestjs/common';

import { PurchaseEntryDto } from '../dto/purchase.dto.js';
import { PurchaseRepository } from '../purchase.repository.js';
import { PurchaseBuilder } from '../purchase.builder.js';
import { PURCHASE_ERROR_MESSAGES as MSG } from '../purchase.constants.js';
import { hasAllowedPrecision, isStaleEntry } from '../purchase.util.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { buildPurchaseKey } from '../../../../common/utils/allocation-key.util.js';
import { OrderItemsRepository } from '../../../../common/repositories/order-items.repository.js';
import { AllocationSummaryBuilder } from '../../../../common/builders/allocation-summary.builder.js';
import { toDecimal } from '../../../../common/utils/money.util.js';
import {
  describeAllocationRow,
  describeProduct,
  describeVehicle,
} from '../../vehicle-allocation/vehicle-allocation.util.js';

export type ExplicitPurchaseEntry = PurchaseEntryDto & { purchasedQty: number };
export type AllocationRow = Awaited<
  ReturnType<PurchaseRepository['findVehicleAllocationsByPaperId']>
>[number];
export type ExistingEntry = Awaited<
  ReturnType<PurchaseRepository['findPurchaseEntries']>
>[number];

export type AcceptedEntry = {
  entry: ExplicitPurchaseEntry;
  key: string;
  label: string;
  allocation: AllocationRow;
  existing: ExistingEntry | undefined;
};

export type IgnoredEntry = {
  vehicleId: number;
  deliverySession: string;
  distributorId: number;
  category: string;
  productId: number;
  reason: 'NOT_ALLOCATED_AND_NOT_SAVED' | 'MISSING_CONFIGURATION';
};

@Injectable()
export class PurchaseValidationService {
  constructor(
    private readonly purchaseRepository: PurchaseRepository,
    private readonly purchaseBuilder: PurchaseBuilder,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly allocationSummaryBuilder: AllocationSummaryBuilder,
  ) {}

  /**
   * Decides what happens to every explicit entry of a save (PD-1 to PD-4, PD-27).
   * All problems are collected and reported together as { message, details[] }.
   */
  async evaluateEntries(params: {
    entries: ExplicitPurchaseEntry[];
    allocations: AllocationRow[];
    existingEntries: ExistingEntry[];
    deletedKeys: Set<string>;
    db: PrismaOrTransaction;
  }) {
    const { entries, allocations, existingEntries, deletedKeys, db } = params;
    const unique = (ids: number[]) => [...new Set(ids)];

    const [vehicles, distributors, products] = await Promise.all([
      this.purchaseRepository.findVehiclesByIds(
        unique(entries.map((e) => e.vehicleId)),
        db,
      ),
      this.purchaseRepository.findDistributorsByIds(
        unique(entries.map((e) => e.distributorId)),
        db,
      ),
      this.purchaseRepository.findProductsByIds(
        unique(entries.map((e) => e.productId)),
        db,
      ),
    ]);
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const distributorById = new Map(distributors.map((d) => [d.id, d]));
    const productById = new Map(products.map((p) => [p.id, p]));

    const problems = new Set<string>();

    // PD-2: unknown identifiers are rejected (also for zero quantities, PD-1).
    for (const id of unique(entries.map((e) => e.vehicleId)))
      if (!vehicleById.has(id)) problems.add(MSG.INVALID_VEHICLE(id));
    for (const id of unique(entries.map((e) => e.distributorId)))
      if (!distributorById.has(id)) problems.add(MSG.INVALID_DISTRIBUTOR(id));
    for (const id of unique(entries.map((e) => e.productId)))
      if (!productById.has(id)) problems.add(MSG.INVALID_PRODUCT(id));

    const keyOf = (e: ExplicitPurchaseEntry) => buildPurchaseKey(e);
    const labelOf = (e: ExplicitPurchaseEntry) => {
      const v = vehicleById.get(e.vehicleId);
      const d = distributorById.get(e.distributorId);
      const p = productById.get(e.productId);
      return `${v ? describeVehicle(v) : `vehicle #${e.vehicleId}`} / ${d?.name ?? `distributor #${e.distributorId}`} (${e.category}) / ${p ? describeProduct(p) : `product #${e.productId}`} (${e.deliverySession})`;
    };

    const allocationByKey = new Map(
      allocations.map((a) => [
        buildPurchaseKey({
          vehicleId: a.vehicle_id,
          distributorId: a.distributor_id,
          category: a.category,
          productId: a.product_id,
          deliverySession: a.vehicle_allocation_paper.delivery_session,
        }),
        a,
      ]),
    );
    const existingByKey = new Map(
      existingEntries.map((e) => [buildPurchaseKey(e), e]),
    );

    const seen = new Set<string>();
    for (const e of entries) {
      const k = keyOf(e);
      if (seen.has(k)) problems.add(MSG.DUPLICATE_ENTRY(labelOf(e)));
      seen.add(k);
    }

    // PD-1: even a zero must have an active distributor-product link. A saved
    // row keeps its frozen link (PD-21), so only new keys are checked.
    const newPairs = entries
      .filter((e) => !existingByKey.has(keyOf(e)))
      .map((e) => ({ distributorId: e.distributorId, productId: e.productId }));
    const linkMap =
      newPairs.length > 0
        ? await this.purchaseRepository.getProductLinksBatch(newPairs, db, true)
        : new Map<
            string,
            {
              id: number;
              distributor_id: number;
              product_id: number;
              is_active: boolean;
            }
          >();

    const accepted: AcceptedEntry[] = [];
    const ignored: IgnoredEntry[] = [];

    for (const entry of entries) {
      if (
        !vehicleById.has(entry.vehicleId) ||
        !distributorById.has(entry.distributorId) ||
        !productById.has(entry.productId)
      )
        continue;

      const key = keyOf(entry);
      const label = labelOf(entry);
      const existing = existingByKey.get(key);
      const allocation = allocationByKey.get(key);

      if (
        !existing &&
        !linkMap.has(`${entry.distributorId}_${entry.productId}`)
      ) {
        problems.add(
          MSG.LINK_MISSING(
            distributorById.get(entry.distributorId)!.name,
            describeProduct(productById.get(entry.productId)!),
          ),
        );
        continue;
      }

      if (deletedKeys.has(key)) {
        problems.add(MSG.ENTRY_ALSO_DELETED(label));
        continue;
      }

      // Zero for a cell that was never allocated and never saved: harmless, reported back.
      if (!existing && !allocation && entry.purchasedQty === 0) {
        ignored.push({
          vehicleId: entry.vehicleId,
          deliverySession: entry.deliverySession,
          distributorId: entry.distributorId,
          category: entry.category,
          productId: entry.productId,
          reason: 'NOT_ALLOCATED_AND_NOT_SAVED',
        });
        continue;
      }

      // PD-4: a saved entry whose allocation vanished or moved is an explicit error.
      if (existing) {
        if (!allocation) {
          problems.add(MSG.ALLOCATION_CHANGED(label));
          continue;
        }
        if (
          entry.sourceAllocationId == null ||
          entry.sourceAllocatedQty == null
        ) {
          problems.add(MSG.ECHO_REQUIRED(label));
          continue;
        }
      }
      if (
        allocation &&
        entry.sourceAllocationId != null &&
        entry.sourceAllocatedQty != null &&
        (entry.sourceAllocationId !== allocation.id ||
          Number(entry.sourceAllocatedQty) !== Number(allocation.allocated_qty))
      ) {
        problems.add(MSG.ALLOCATION_CHANGED(label));
        continue;
      }

      if (entry.purchasedQty > 0) {
        if (!allocation) {
          problems.add(MSG.ALLOCATION_NOT_FOUND(label));
          continue;
        }
        if (
          toDecimal(entry.purchasedQty).greaterThan(
            toDecimal(allocation.allocated_qty),
          )
        ) {
          problems.add(
            MSG.PURCHASE_EXCEEDS_ALLOCATION(
              label,
              entry.purchasedQty,
              Number(allocation.allocated_qty),
            ),
          );
          continue;
        }
      }

      // PD-27: new or changed quantities must have at most 2 decimals; an
      // unchanged echo of a stored value is tolerated.
      const unchanged =
        existing && Number(existing.purchased_qty) === entry.purchasedQty;
      if (!unchanged && !hasAllowedPrecision(entry.purchasedQty)) {
        problems.add(MSG.QUANTITY_PRECISION(label, entry.purchasedQty));
        continue;
      }

      // A zero for an allocated, unsaved cell is a confirmed "bought none" (PD-39).
      accepted.push({ entry, key, label, allocation: allocation!, existing });
    }

    if (problems.size > 0) {
      throw new BadRequestException({
        message: MSG.INVALID_ENTRIES,
        details: [...problems],
      });
    }

    return { accepted, ignored, linkMap };
  }

  /**
   * Submission gate (morning submit and re-finalize of a reopened paper).
   * PD-8 / PD-36 / PD-37 / PD-38 / PD-54: everything that blocks is reported
   * in one response. It checks record completeness, not fulfillment (PD-42).
   */
  async validatePurchasesComplete(paperId: number, db: PrismaOrTransaction) {
    const [orderItems, allocations, purchasePaper] = await Promise.all([
      this.orderItemsRepository.getOrderItemsWithSupplyContextByPaperId(
        paperId,
        db,
      ),
      this.purchaseRepository.findVehicleAllocationsByPaperId(paperId, db),
      this.purchaseRepository.findPurchasePaper(paperId, db),
    ]);

    const entries = purchasePaper
      ? await this.purchaseRepository.findPurchaseEntries(purchasePaper.id, db)
      : [];

    const required = allocations.filter((a) => Number(a.allocated_qty) > 0);
    const keyOfAllocation = (a: AllocationRow) =>
      buildPurchaseKey({
        vehicleId: a.vehicle_id,
        distributorId: a.distributor_id,
        category: a.category,
        productId: a.product_id,
        deliverySession: a.vehicle_allocation_paper.delivery_session,
      });
    const allocationByKey = new Map(
      allocations.map((a) => [keyOfAllocation(a), a]),
    );
    const savedKeys = new Set(entries.map((e) => buildPurchaseKey(e)));

    const missing = required
      .filter((a) => !savedKeys.has(keyOfAllocation(a)))
      .map(
        (a) =>
          `${describeAllocationRow(a)} (${a.vehicle_allocation_paper.delivery_session})`,
      );

    const grids = this.purchaseBuilder.buildPurchaseGrids(
      this.allocationSummaryBuilder.build(orderItems),
      allocations,
    );

    const orphanRecords = this.purchaseBuilder.findOrphanedEntries(
      grids,
      entries,
    );
    const orphanIds = new Set(orphanRecords.map((o) => o.entryId));
    const orphans = orphanRecords.map(
      (o) =>
        `${o.vehicleName} / ${o.distributorName} (${o.category}) / ${o.productName} (${o.deliverySession})`,
    );

    // PD-68: an orphan is reported under orphans[] only, never also as stale.
    const stale = entries
      .filter(
        (e) =>
          !orphanIds.has(e.id) &&
          isStaleEntry(e, allocationByKey.get(buildPurchaseKey(e))),
      )
      .map(
        (e) =>
          `${describeVehicle(e.master_vehicle)} / ${e.distributor.name} (${e.category}) / ${describeProduct(e.master_product)} (${e.delivery_session})`,
      );

    const signOffRequired =
      required.length === 0 && !purchasePaper?.signed_off_at;

    if (missing.length + stale.length + orphans.length > 0 || signOffRequired) {
      throw new BadRequestException({
        message: MSG.PURCHASES_NOT_COMPLETED,
        missing,
        stale,
        orphans,
        zeroAllocationSignOffRequired: signOffRequired,
        details: [
          ...missing.map((m) => `Purchase missing: ${m}`),
          ...stale.map((s) => `Stale (allocation changed since saved): ${s}`),
          ...orphans.map((o) => `Unresolved orphan record: ${o}`),
          ...(signOffRequired
            ? ['Zero allocation: a sign-off is required before submitting']
            : []),
        ],
      });
    }
  }
}
