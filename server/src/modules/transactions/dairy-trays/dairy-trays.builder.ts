import { Injectable } from '@nestjs/common';
import { DeliverySession, Prisma } from '../../../generated/prisma/client.js';
import { SaveDairyTrayEntryDto } from './dto/save-dairy-tray-entry.dto.js';
import {
  Vehicle,
  BuildDairyTrayGridParams,
  DairyTrayTransaction,
  DairyTrayGrid,
  DairyTrayRow,
  DairyTrayTotals,
  DairyTrayColumnNode,
  PurchaseEntry,
} from '../../../types/dairy-trays.types.js';
import { ProductTrayRule, TrayType } from '../../../types/tray.types.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

@Injectable()
export class DairyTraysBuilder {
  constructor(
    private readonly trayCalculationService: TrayCalculationService,
  ) {}

  buildDairyTrayGrid({
    vehicles,
    trayTypes,
    purchaseEntries,
    trayRules,
    previousTransactions,
    currentTransactions,
  }: BuildDairyTrayGridParams): DairyTrayGrid {
    const columns = this.buildTrayColumns(trayTypes);

    const takenMap =
      this.trayCalculationService.buildTakenMapFromPurchaseEntries(
        purchaseEntries,
        trayRules,
      );

    const rows = this.buildRows(
      vehicles,
      trayTypes,
      purchaseEntries,
      takenMap,
      previousTransactions,
      currentTransactions,
    );

    const totals = this.buildTotals(rows, trayTypes);

    return {
      columns,
      rows,
      totals,
    };
  }

  private buildTrayColumns(trayTypes: TrayType[]): DairyTrayColumnNode[] {
    const brandMap = new Map<
      string,
      {
        headerName: string;
        children: DairyTrayColumnNode[];
      }
    >();

    for (const trayType of trayTypes) {
      const brandName = trayType.master_brand.name;

      if (!brandMap.has(brandName)) {
        brandMap.set(
          brandName,

          {
            headerName: `${brandName} Tray`,

            children: [],
          },
        );
      }

      const brandGroup = brandMap.get(brandName)!;

      brandGroup.children.push({
        headerName: `${trayType.color} Tray`,

        children: [
          {
            headerName: 'Opening',

            field: `tray_${trayType.id}_opening`,

            editable: false,
          },

          {
            headerName: 'Trays',

            field: `tray_${trayType.id}`,

            editable: false,
          },

          {
            headerName: 'Returned',

            field: `tray_${trayType.id}_returned`,

            editable: true,
          },

          {
            headerName: 'Closing',

            field: `tray_${trayType.id}_closing`,

            editable: false,
          },
        ],
      });
    }

    return [
      {
        headerName: 'Vehicle',

        field: 'vehicleName',

        pinned: 'left',
      },

      ...Array.from(brandMap.values()),
    ];
  }

  private buildRows(
    vehicles: Vehicle[],
    trayTypes: TrayType[],
    purchaseEntries: PurchaseEntry[],
    takenMap: Map<number, Map<DeliverySession, Map<number, number>>>,
    previousTransactions: DairyTrayTransaction[],
    currentTransactions: DairyTrayTransaction[],
  ): DairyTrayRow[] {
    const rows: DairyTrayRow[] = [];

    const trayFields = this.initializeTrayFields(trayTypes);

    const sessions = [DeliverySession.NIGHT, DeliverySession.MORNING];

    const vehicleSessions = new Set(
      purchaseEntries.map(
        (entry) => `${entry.vehicle_id}_${entry.delivery_session}`,
      ),
    );

    for (const vehicle of vehicles) {
      for (const session of sessions) {
        if (!vehicleSessions.has(`${vehicle.id}_${session}`)) {
          continue;
        }
        const row: DairyTrayRow = {
          vehicleId: vehicle.id,
          vehicleName: vehicle.vehicle_name,
          deliverySession: session,
          ...structuredClone(trayFields),
        };

        const sessionTaken = takenMap.get(vehicle.id)?.get(session);

        for (const trayType of trayTypes) {
          const current = currentTransactions.find(
            (transaction) =>
              transaction.vehicle_id === vehicle.id &&
              transaction.tray_type_id === trayType.id &&
              transaction.delivery_session === session,
          );

          const previous = previousTransactions.find(
            (transaction) =>
              transaction.vehicle_id === vehicle.id &&
              transaction.tray_type_id === trayType.id &&
              transaction.delivery_session === session,
          );

          const opening = Number(previous?.closing_balance ?? 0);

          const trays = sessionTaken?.get(trayType.id) ?? 0;

          const returned = current?.trays_returned ?? 0;

          const closing = this.trayCalculationService.calculateClosingBalance(
            opening,
            trays,
            returned,
          );

          row[`tray_${trayType.id}_opening`] = opening;
          row[`tray_${trayType.id}`] = trays;
          row[`tray_${trayType.id}_returned`] = returned;
          row[`tray_${trayType.id}_closing`] = closing;
        }
        rows.push(row);
      }
    }

    return rows;
  }

  private buildTotals(
    rows: DairyTrayRow[],
    trayTypes: TrayType[],
  ): DairyTrayTotals {
    const totals: DairyTrayTotals = {
      totalVehicles: new Set(rows.map((row) => row.vehicleId)).size,
    };

    for (const trayType of trayTypes) {
      let opening = 0;
      let trays = 0;
      let returned = 0;
      let closing = 0;

      for (const row of rows) {
        opening += Number(row[`tray_${trayType.id}_opening`] ?? 0);
        trays += Number(row[`tray_${trayType.id}`] ?? 0);
        returned += Number(row[`tray_${trayType.id}_returned`] ?? 0);
        closing += Number(row[`tray_${trayType.id}_closing`] ?? 0);
      }

      totals[`tray_${trayType.id}`] = {
        opening,
        trays,
        returned,
        closing,
      };
    }

    return totals;
  }

  private initializeTrayFields(trayTypes: TrayType[]): Record<string, number> {
    const row: Record<string, number> = {};

    for (const trayType of trayTypes) {
      row[`tray_${trayType.id}_opening`] = 0;
      row[`tray_${trayType.id}`] = 0;
      row[`tray_${trayType.id}_returned`] = 0;
      row[`tray_${trayType.id}_closing`] = 0;
    }

    return row;
  }
}
