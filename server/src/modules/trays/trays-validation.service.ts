import { Injectable, BadRequestException } from '@nestjs/common';
import { TraysService } from './trays.service.js';

@Injectable()
export class TraysValidationService {
  constructor(private readonly traysService: TraysService) {}

  /**
   * Validate that all tray returns are complete
   * Called during morning submission
   */
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
        `Tray validation failed for sheet ${sheetId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private validateTrayRow(row: any): void {
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
            `Tray returns incomplete for client "${row.client_name}"`,
          );
        }
      }
    }
  }

  async validateTrayCalculationExists(sheetId: number): Promise<void> {
    const traySheet = await this.traysService.getTraySheetService(sheetId);

    if (!traySheet.trayBilling || traySheet.trayBilling.rows.length === 0) {
      throw new BadRequestException('Tray calculation failed');
    }
  }
}
