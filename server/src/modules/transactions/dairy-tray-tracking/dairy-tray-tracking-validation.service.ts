import { BadRequestException, Injectable } from '@nestjs/common';

import { SaveDairyTrayEntryDto } from './dto/save-dairy-tray-entry.dto.js';
import { DAIRY_TRAY_TRACKING_ERROR_MESSAGES } from './dairy-tray-tracking.constants.js';
import { DairyTrayTrackingRepository } from './dairy-tray-tracking.repository.js';

@Injectable()
export class DairyTrayTrackingValidationService {
  constructor(private readonly repository: DairyTrayTrackingRepository) {}
  validateSaveRequest(
    entries: SaveDairyTrayEntryDto[],
    vehicles: { id: number }[],
    trayTypes: { id: number }[],
  ) {
    this.validateDuplicateEntries(entries);
    this.validateVehicleIds(entries, vehicles);
    this.validateTrayTypeIds(entries, trayTypes);
  }

  private validateDuplicateEntries(entries: SaveDairyTrayEntryDto[]) {
    const seen = new Set<string>();

    for (const entry of entries) {
      const key = `${entry.vehicleId}_${entry.trayTypeId}`;

      if (seen.has(key)) {
        throw new BadRequestException(
          DAIRY_TRAY_TRACKING_ERROR_MESSAGES.DUPLICATE_ENTRY(
            entry.vehicleId,
            entry.trayTypeId,
          ),
        );
      }

      seen.add(key);
    }
  }

  private validateVehicleIds(
    entries: SaveDairyTrayEntryDto[],
    vehicles: { id: number }[],
  ) {
    const validVehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));

    for (const entry of entries) {
      if (!validVehicleIds.has(entry.vehicleId)) {
        throw new BadRequestException(
          DAIRY_TRAY_TRACKING_ERROR_MESSAGES.INVALID_VEHICLE(entry.vehicleId),
        );
      }
    }
  }

  private validateTrayTypeIds(
    entries: SaveDairyTrayEntryDto[],
    trayTypes: { id: number }[],
  ) {
    const validTrayTypeIds = new Set(trayTypes.map((trayType) => trayType.id));

    for (const entry of entries) {
      if (!validTrayTypeIds.has(entry.trayTypeId)) {
        throw new BadRequestException(
          DAIRY_TRAY_TRACKING_ERROR_MESSAGES.INVALID_TRAY_TYPE(
            entry.trayTypeId,
          ),
        );
      }
    }
  }

  async validateDairyTrayTrackingComplete(paperId: number) {
    const dairyTrayPaper =
      await this.repository.findDairyTrayPaperByOrderPaperId(paperId);

    if (!dairyTrayPaper) {
      throw new BadRequestException(
        DAIRY_TRAY_TRACKING_ERROR_MESSAGES.DAIRY_TRAY_PAPER_NOT_FOUND,
      );
    }

    const [transactions, purchaseEntries, trayRules] = await Promise.all([
      this.repository.getCurrentTrayTransactions(dairyTrayPaper.id),
      this.repository.getPurchaseEntries(paperId),
      this.repository.getProductTrayRules(),
    ]);

    const expected = new Set<string>();

    for (const purchase of purchaseEntries) {
      const rule = trayRules.find(
        (rule) =>
          rule.brand_id === purchase.master_product.brand_id &&
          rule.product_group_id === purchase.master_product.product_group_id &&
          (!rule.applies_to_packaging ||
            rule.packaging_type_id ===
              purchase.master_product.packaging_type_id),
      );

      if (!rule) {
        continue;
      }

      expected.add(`${purchase.vehicle_id}_${rule.tray_type_id}`);
    }

    const existing = new Set(
      transactions.map(
        (transaction) =>
          `${transaction.vehicle_id}_${transaction.tray_type_id}`,
      ),
    );

    for (const key of expected) {
      if (!existing.has(key)) {
        const [vehicleId, trayTypeId] = key.split('_');

        throw new BadRequestException(
          DAIRY_TRAY_TRACKING_ERROR_MESSAGES.MISSING_ENTRY(
            Number(vehicleId),
            Number(trayTypeId),
          ),
        );
      }
    }
  }
}
