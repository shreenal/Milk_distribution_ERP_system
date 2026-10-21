import { Injectable } from '@nestjs/common';
import { VehicleAllocationRepository } from '../vehicle-allocation.repository.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import {
  AllocationAnomalyView,
  AllocationDetection,
  InvalidAllocation,
  StaleAllocation,
  StaleAllocationView,
  StoredAllocation,
  StoredAnomaly,
} from '../../../../types/vehicle-allocation.types.js';
import { VehicleAllocationAnomalyReason } from '../../../../generated/prisma/client.js';
import {
  Decimal,
  moneyEquals,
  toDecimal,
} from '../../../../common/utils/money.util.js';
import {
  ANOMALY_REASON_MESSAGES,
  VEHICLE_ALLOCATION_LIMITS,
} from '../vehicle-allocation.constants.js';
import {
  buildRequirementKey,
  describeProduct,
  describeVehicle,
} from '../vehicle-allocation.util.js';

/**
 * VA-6 / VA-7: the Stale -> Flagged -> Reconciled lifecycle.
 *
 * - Stale: detected live from the stored rows and the CURRENT orders / master data.
 * - Flagged: the invalid row is removed and its evidence is stored in
 *   vehicle_allocation_anomaly, so the warning survives the deletion.
 * - Reconciled: a later write leaves the affected product fully allocated (or no
 *   longer required), so the evidence row is closed.
 */
@Injectable()
export class VehicleAllocationReconciliationService {
  constructor(private readonly repository: VehicleAllocationRepository) {}

  async detect(
    stored: StoredAllocation[],
    requiredTotals: Map<string, number>,
    db: PrismaOrTransaction,
  ): Promise<AllocationDetection> {
    const invalid: InvalidAllocation[] = [];
    const stale: StaleAllocation[] = [];

    if (stored.length === 0) return { invalid, stale };

    const linkMap = await this.repository.getProductLinksBatch(
      stored.map((row) => ({
        distributorId: row.distributor_id,
        productId: row.product_id,
      })),
      db,
      true,
    );

    for (const row of stored) {
      const required = requiredTotals.get(
        buildRequirementKey(row.distributor_id, row.category, row.product_id),
      );

      let reason: VehicleAllocationAnomalyReason | null = null;

      if (!row.master_vehicle.is_active) {
        reason = VehicleAllocationAnomalyReason.VEHICLE_INACTIVE;
      } else if (required === undefined) {
        reason = VehicleAllocationAnomalyReason.NOT_REQUIRED;
      } else if (!linkMap.has(`${row.distributor_id}_${row.product_id}`)) {
        reason = VehicleAllocationAnomalyReason.LINK_INACTIVE;
      }

      if (reason !== null) {
        invalid.push({ row, reason });
        continue;
      }

      // Rows saved before the snapshot column existed have no snapshot and
      // are not judged until their next save.
      if (
        required !== undefined &&
        row.required_qty_at_save !== null &&
        !moneyEquals(
          row.required_qty_at_save,
          required,
          VEHICLE_ALLOCATION_LIMITS.COVERAGE_TOLERANCE,
        )
      ) {
        stale.push({
          row,
          requiredAtSave: Number(row.required_qty_at_save),
          currentRequired: required,
        });
      }
    }

    return { invalid, stale };
  }

  /** Stores the evidence for rows that are about to be removed. */
  async flagInvalid(
    allocationPaperId: number,
    invalid: InvalidAllocation[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    for (const { row, reason } of invalid) {
      await this.repository.upsertAnomaly(
        {
          vehicleAllocationPaperId: allocationPaperId,
          vehicleId: row.vehicle_id,
          distributorId: row.distributor_id,
          category: row.category,
          productId: row.product_id,
          removedQty: row.allocated_qty,
          reason,
        },
        db,
      );
    }
  }

  /**
   * Flagged anomalies that the given (post-write) rows have resolved: the
   * product is no longer required, or it is fully allocated again. Callers pass
   * only anomalies flagged BEFORE the current transaction, so an anomaly is
   * always visible to the employee at least once.
   */
  selectResolvable(
    flagged: StoredAnomaly[],
    requiredTotals: Map<string, number>,
    rows: {
      distributor_id: number;
      category: string;
      product_id: number;
      allocated_qty: unknown;
    }[],
  ): StoredAnomaly[] {
    const allocated = new Map<string, Decimal>();
    for (const row of rows) {
      const key = buildRequirementKey(
        row.distributor_id,
        row.category,
        row.product_id,
      );
      allocated.set(
        key,
        (allocated.get(key) ?? new Decimal(0)).plus(
          toDecimal(row.allocated_qty as never),
        ),
      );
    }

    return flagged.filter((anomaly) => {
      const key = buildRequirementKey(
        anomaly.distributor_id,
        anomaly.category,
        anomaly.product_id,
      );
      const required = requiredTotals.get(key);
      if (required === undefined) return true;
      return moneyEquals(
        allocated.get(key) ?? new Decimal(0),
        toDecimal(required),
        VEHICLE_ALLOCATION_LIMITS.COVERAGE_TOLERANCE,
      );
    });
  }

  async markReconciled(
    anomalies: StoredAnomaly[],
    db: PrismaOrTransaction,
  ): Promise<void> {
    await this.repository.markAnomaliesReconciled(
      anomalies.map((a) => a.id),
      db,
    );
  }

  // -------------------------------------------------------------------
  // Views for the grid response (VA-3.4)
  // -------------------------------------------------------------------

  toInvalidView({ row, reason }: InvalidAllocation): StaleAllocationView {
    return {
      kind: 'INVALID',
      reason,
      message: `${describeVehicle(row.master_vehicle)} / ${row.distributor.name} (${row.category}) / ${describeProduct(row.master_product)}: ${ANOMALY_REASON_MESSAGES[reason]}. This allocation will be removed on the next save or reconcile.`,
      vehicleId: row.vehicle_id,
      vehicleName: describeVehicle(row.master_vehicle),
      distributorId: row.distributor_id,
      distributorName: row.distributor.name,
      category: row.category,
      productId: row.product_id,
      productName: describeProduct(row.master_product),
      allocatedQty: Number(row.allocated_qty),
    };
  }

  toStaleView(stale: StaleAllocation): StaleAllocationView {
    const { row } = stale;
    return {
      kind: 'REQUIREMENT_CHANGED',
      reason: 'REQUIREMENT_CHANGED',
      message: `${describeVehicle(row.master_vehicle)} / ${row.distributor.name} (${row.category}) / ${describeProduct(row.master_product)}: the required quantity changed from ${stale.requiredAtSave} to ${stale.currentRequired} since this allocation was saved. Review it and save again.`,
      vehicleId: row.vehicle_id,
      vehicleName: describeVehicle(row.master_vehicle),
      distributorId: row.distributor_id,
      distributorName: row.distributor.name,
      category: row.category,
      productId: row.product_id,
      productName: describeProduct(row.master_product),
      allocatedQty: Number(row.allocated_qty),
    };
  }

  toAnomalyView(anomaly: StoredAnomaly): AllocationAnomalyView {
    return {
      id: anomaly.id,
      reason: anomaly.reason,
      message: `${describeVehicle(anomaly.master_vehicle)} / ${anomaly.distributor.name} (${anomaly.category}) / ${describeProduct(anomaly.master_product)}: ${Number(anomaly.removed_qty)} was removed because ${ANOMALY_REASON_MESSAGES[anomaly.reason]}.`,
      vehicleId: anomaly.vehicle_id,
      vehicleName: describeVehicle(anomaly.master_vehicle),
      distributorId: anomaly.distributor_id,
      distributorName: anomaly.distributor.name,
      category: anomaly.category,
      productId: anomaly.product_id,
      productName: describeProduct(anomaly.master_product),
      removedQty: Number(anomaly.removed_qty),
      flaggedAt: anomaly.flagged_at,
    };
  }
}
