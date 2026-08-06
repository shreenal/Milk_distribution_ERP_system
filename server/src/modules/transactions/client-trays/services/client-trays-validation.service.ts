import { Injectable, BadRequestException } from '@nestjs/common';
import { ClientTraysService } from '../client-trays.service.js';
import { ClientTrayRow } from '../../../../types/client-trays.types.js';
import { CLIENT_TRAY_ERROR_MESSAGES } from '../client-trays.constants.js';

@Injectable()
export class ClientTraysValidationService {
  constructor(private readonly clienttraysService: ClientTraysService) {}

  async validateTrayCompleteness(sheetId: number): Promise<void> {
    try {
      const traySheet =
        await this.clienttraysService.getTraySheetService(sheetId);
      const rows = [
        ...traySheet.milkTrayGrid.rows,
        ...traySheet.nonMilkTrayGrid.rows,
      ];

      if (rows.length === 0) {
        return;
      }

      for (const row of rows) {
        this.validateTrayRow(row);
      }
    } catch (error) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.VALIDATION_FAILED(
          sheetId,
          error instanceof Error
            ? error.message
            : CLIENT_TRAY_ERROR_MESSAGES.UNKNOWN_VALIDATION_ERROR,
        ),
      );
    }
  }

  private validateTrayRow(row: ClientTrayRow): void {
    const trayTypeKeys = Object.keys(row).filter((key) =>
      key.endsWith('_returned'),
    );

    for (const key of trayTypeKeys) {
      const trayPrefix = key.replace('_returned', '');
      const trays = Number(row[trayPrefix] ?? 0);
      const opening = Number(row[`${trayPrefix}_opening`] ?? 0);
      const returned = row[key];

      if (trays > 0 || opening > 0) {
        if (returned === null || returned === undefined || returned === '') {
          throw new BadRequestException(
            CLIENT_TRAY_ERROR_MESSAGES.INCOMPLETE_TRAY_RETURNS(
              String(row.clientName),
            ),
          );
        }
      }
    }
  }

  async validateTrayCalculationExists(sheetId: number): Promise<void> {
    const traySheet =
      await this.clienttraysService.getTraySheetService(sheetId);
    const totalRows =
      traySheet.milkTrayGrid.rows.length +
      traySheet.nonMilkTrayGrid.rows.length;

    if (totalRows === 0) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.CALCULATION_FAILED,
      );
    }
  }
}
