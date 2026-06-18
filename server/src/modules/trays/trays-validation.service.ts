import { Injectable, BadRequestException } from '@nestjs/common';
import { TraysService } from './trays.service.js';
import { TrayRow } from './tray.billing-builder.js';
import { TRAY_ERROR_MESSAGES } from './trays.constants.js';

@Injectable()
export class TraysValidationService {
  constructor(private readonly traysService: TraysService) {}

  async validateTrayCompleteness(sheetId: number): Promise<void> {
    try {
      const traySheet = await this.traysService.getTraySheetService(sheetId);

      if (!traySheet.trayBilling?.rows) {
        return;
      }

      for (const row of traySheet.trayBilling.rows) {
        this.validateTrayRow(row);
      }
    } catch (error) {
      throw new BadRequestException(
        TRAY_ERROR_MESSAGES.VALIDATION_FAILED(
          sheetId,
          error instanceof Error
            ? error.message
            : TRAY_ERROR_MESSAGES.UNKNOWN_VALIDATION_ERROR,
        ),
      );
    }
  }

  private validateTrayRow(row: TrayRow): void {
    const trayTypeKeys = Object.keys(row).filter((key) =>
      key.endsWith('_returned'),
    );

    for (const key of trayTypeKeys) {
      const trayPrefix = key.replace('_returned', '');
      const taken = Number(row[`${trayPrefix}_taken`] ?? 0);
      const opening = Number(row[`${trayPrefix}_opening`] ?? 0);
      const returned = row[key];

      if (taken > 0 || opening > 0) {
        if (returned === null || returned === undefined || returned === '') {
          throw new BadRequestException(
            TRAY_ERROR_MESSAGES.INCOMPLETE_TRAY_RETURNS(
              String(row.client_name),
            ),
          );
        }
      }
    }
  }

  async validateTrayCalculationExists(sheetId: number): Promise<void> {
    const traySheet = await this.traysService.getTraySheetService(sheetId);

    if (!traySheet.trayBilling || traySheet.trayBilling.rows.length === 0) {
      throw new BadRequestException(TRAY_ERROR_MESSAGES.CALCULATION_FAILED);
    }
  }
}
