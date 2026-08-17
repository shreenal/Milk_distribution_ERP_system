import { BadRequestException, Injectable } from '@nestjs/common';

import { SaveDairyTrayEntryDto } from '.././dto/save-dairy-tray-entry.dto.js';
import { DAIRY_TRAYS_ERROR_MESSAGES } from '.././dairy-trays.constants.js';
import { DairyTraysRepository } from '.././dairy-trays.repository.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';

@Injectable()
export class DairyTraysValidationService {
  constructor(
    private readonly dairytraysrepository: DairyTraysRepository,
    private readonly trayCalculationService: TrayCalculationService,
  ) {}
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
      const key = `${entry.vehicleId}_${entry.deliverySession}_${entry.trayTypeId}`;

      if (seen.has(key)) {
        throw new BadRequestException(
          DAIRY_TRAYS_ERROR_MESSAGES.DUPLICATE_ENTRY(
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
          DAIRY_TRAYS_ERROR_MESSAGES.INVALID_VEHICLE(entry.vehicleId),
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
          DAIRY_TRAYS_ERROR_MESSAGES.INVALID_TRAY_TYPE(entry.trayTypeId),
        );
      }
    }
  }

  async validateDairyTraysComplete(paperId: number, db: PrismaOrTransaction) {
    const dairyTrayPaper =
      await this.dairytraysrepository.findDairyTrayPaperByOrderPaperId(
        paperId,
        db,
      );

    if (!dairyTrayPaper) {
      throw new BadRequestException(
        DAIRY_TRAYS_ERROR_MESSAGES.DAIRY_TRAY_PAPER_NOT_FOUND,
      );
    }

    const [transactions, purchaseEntries, trayRules] = await Promise.all([
      this.dairytraysrepository.getCurrentTrayTransactions(
        dairyTrayPaper.id,
        db,
      ),
      this.dairytraysrepository.getPurchaseEntries(paperId, db),
      this.dairytraysrepository.getProductTrayRules(db),
    ]);

    const expected = new Set<string>();

    for (const purchase of purchaseEntries) {
      const rule = this.trayCalculationService.resolveTrayRule(
        purchase.master_product,
        trayRules,
      );

      if (!rule) {
        continue;
      }

      expected.add(
        `${purchase.vehicle_id}_${purchase.delivery_session}_${rule.tray_type_id}`,
      );
    }

    const existing = new Set(
      transactions.map(
        (transaction) =>
          `${transaction.vehicle_id}_${transaction.delivery_session}_${transaction.tray_type_id}`,
      ),
    );

    for (const key of expected) {
      if (!existing.has(key)) {
        const [vehicleId, deliverySession, trayTypeId] = key.split('_');

        throw new BadRequestException(
          DAIRY_TRAYS_ERROR_MESSAGES.MISSING_ENTRY(
            Number(vehicleId),
            Number(trayTypeId),
          ),
        );
      }
    }
  }
}
