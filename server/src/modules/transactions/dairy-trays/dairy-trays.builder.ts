import { Injectable } from '@nestjs/common';
import { DeliverySession } from '../../../generated/prisma/client.js';
import {
  BuildDairyTrayGridParams,
  DairyTrayColumnNode,
  DairyTrayGrid,
  DairyTrayLedgerLine,
  DairyTrayRow,
  DairyTrayTotals,
  Vehicle,
} from '../../../types/dairy-trays.types.js';
import { TrayType } from '../../../types/tray.types.js';
import { buildDairyTrayKey, describeVehicle } from './dairy-trays.util.js';

/**
 * Display only. The ledger lines (opening, taken, returned, closing) are
 * calculated by DairyTraysLedgerService; this turns them into the grid.
 */
@Injectable()
export class DairyTraysBuilder {
  buildDairyTrayGrid({
    vehicles,
    trayTypes,
    ledgerLines,
  }: BuildDairyTrayGridParams): DairyTrayGrid {
    // DT-8.3: every active tray type is a column; an inactive one only while
    // it has a ledger line (an open balance), and then read-only.
    const lineTrayTypeIds = new Set(ledgerLines.map((l) => l.trayTypeId));
    const shownTrayTypes = trayTypes.filter(
      (t) => t.is_active || lineTrayTypeIds.has(t.id),
    );

    const columns = this.buildTrayColumns(shownTrayTypes);
    const rows = this.buildRows(vehicles, shownTrayTypes, ledgerLines);

    return {
      columns,
      rows,
      // DT-3.7: NIGHT and MORNING are independent ledgers, so totals exist
      // per session only. There is no combined total.
      sessionTotals: {
        [DeliverySession.NIGHT]: this.buildTotals(
          rows.filter((r) => r.deliverySession === DeliverySession.NIGHT),
          shownTrayTypes,
        ),
        [DeliverySession.MORNING]: this.buildTotals(
          rows.filter((r) => r.deliverySession === DeliverySession.MORNING),
          shownTrayTypes,
        ),
      },
    };
  }

  private buildTrayColumns(trayTypes: TrayType[]): DairyTrayColumnNode[] {
    const brandMap = new Map<
      string,
      { headerName: string; children: DairyTrayColumnNode[] }
    >();

    for (const trayType of trayTypes) {
      const brandName = trayType.master_brand.name;

      if (!brandMap.has(brandName)) {
        brandMap.set(brandName, {
          headerName: `${brandName} Tray`,
          children: [],
        });
      }

      brandMap.get(brandName)!.children.push({
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
            // DT-8.3: inactive tray types are shown read-only.
            editable: trayType.is_active,
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
    ledgerLines: DairyTrayLedgerLine[],
  ): DairyTrayRow[] {
    const lineByKey = new Map(
      ledgerLines.map((line) => [buildDairyTrayKey(line), line]),
    );
    const rowKeys = new Set(
      ledgerLines.map((line) => `${line.vehicleId}_${line.deliverySession}`),
    );

    const sortedVehicles = [...vehicles].sort(
      (a, b) =>
        describeVehicle(a).localeCompare(describeVehicle(b)) || a.id - b.id,
    );

    const rows: DairyTrayRow[] = [];

    // DT-3.5: a row exists for every vehicle + session that has a ledger line,
    // whether it comes from today's purchases or from a carried balance.
    for (const vehicle of sortedVehicles) {
      for (const session of [DeliverySession.NIGHT, DeliverySession.MORNING]) {
        if (!rowKeys.has(`${vehicle.id}_${session}`)) continue;

        const row: DairyTrayRow = {
          vehicleId: vehicle.id,
          vehicleName: describeVehicle(vehicle),
          deliverySession: session,
          readOnly: !vehicle.is_active,
        };

        for (const trayType of trayTypes) {
          const line = lineByKey.get(
            buildDairyTrayKey({
              vehicleId: vehicle.id,
              deliverySession: session,
              trayTypeId: trayType.id,
            }),
          );

          row[`tray_${trayType.id}_opening`] = line?.opening ?? 0;
          row[`tray_${trayType.id}`] = line?.taken ?? 0;
          // DT-4.6: a return that was never entered is shown as 0.
          row[`tray_${trayType.id}_returned`] = line?.returned ?? 0;
          row[`tray_${trayType.id}_closing`] = line?.closing ?? 0;
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

      totals[`tray_${trayType.id}`] = { opening, trays, returned, closing };
    }

    return totals;
  }
}
