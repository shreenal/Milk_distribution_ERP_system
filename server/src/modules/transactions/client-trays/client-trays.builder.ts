import { Injectable } from '@nestjs/common';

import { SupplyCategory } from '../../../generated/prisma/client.js';
import {
  TrayClient,
  ClientTrayColumnNode,
  ClientTrayGrid,
  ClientTrayRow,
  ClientTrayTotals,
} from '../../../types/client-trays.types.js';

import type { TrayType } from '../../../types/tray.types.js';
import { ClientTrayLedgerLine } from '../../../common/calculators/tray-calculation.service.js';
import { buildClientTrayKey } from '../../../common/utils/client-tray-key.util.js';

/**
 * Display only. The ledger lines (opening, taken, returned, closing) are
 * calculated by the service; this turns them into the two grids.
 */
@Injectable()
export class ClientTraysBuilder {
  buildTrayBilling(data: {
    clients: TrayClient[];
    trayTypes: TrayType[];
    ledgerLines: ClientTrayLedgerLine[];
  }) {
    return {
      milkTrayGrid: this.buildGrid(SupplyCategory.MILK, data),
      nonMilkTrayGrid: this.buildGrid(SupplyCategory.NON_MILK, data),
    };
  }

  private buildTrayColumns(trayTypes: TrayType[]) {
    const brandMap = new Map<
      string,
      {
        headerName: string;
        children: ClientTrayColumnNode[];
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

            // Decision 10: inactive tray types are shown read-only.
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
        headerName: 'Client',

        field: 'clientName',

        pinned: 'left',
      },

      ...Array.from(brandMap.values()),
    ];
  }

  private buildGrid(
    category: SupplyCategory,
    data: {
      clients: TrayClient[];
      trayTypes: TrayType[];
      ledgerLines: ClientTrayLedgerLine[];
    },
  ): ClientTrayGrid {
    // Decisions 7, 8 and 9: a grid shows exactly the clients and tray types
    // that have a ledger line in its own category.
    const lines = data.ledgerLines.filter((line) => line.category === category);

    const trayTypeIds = new Set(lines.map((line) => line.trayTypeId));
    const clientIds = new Set(lines.map((line) => line.clientId));

    const trayTypes = data.trayTypes.filter((t) => trayTypeIds.has(t.id));
    const clients = data.clients
      .filter((c) => clientIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const columns = this.buildTrayColumns(trayTypes);

    const lineByKey = new Map(
      lines.map((line) => [buildClientTrayKey(line), line]),
    );

    // =========================
    // ROWS
    // =========================

    const rows = clients.map((client) => {
      const row: ClientTrayRow = {
        clientId: client.id,
        clientName: client.name,
      };

      for (const trayType of trayTypes) {
        const line = lineByKey.get(
          buildClientTrayKey({
            clientId: client.id,
            trayTypeId: trayType.id,
            category,
          }),
        );

        // A returned value that was never entered is shown as 0.
        row[`tray_${trayType.id}_opening`] = line?.opening ?? 0;

        row[`tray_${trayType.id}`] = line?.taken ?? 0;

        row[`tray_${trayType.id}_returned`] = line?.returned ?? 0;

        row[`tray_${trayType.id}_closing`] = line?.closing ?? 0;
      }

      return row;
    });

    // =========================
    // TOTALS
    // =========================

    const totals: ClientTrayTotals = {
      totalClients: rows.length,
    };

    for (const trayType of trayTypes) {
      const trayTypeId = trayType.id;

      totals[`tray_${trayTypeId}`] = {
        opening: rows.reduce(
          (sum, row) => sum + Number(row[`tray_${trayTypeId}_opening`] ?? 0),

          0,
        ),

        taken: rows.reduce(
          (sum, row) => sum + Number(row[`tray_${trayTypeId}`] ?? 0),

          0,
        ),

        returned: rows.reduce(
          (sum, row) => sum + Number(row[`tray_${trayTypeId}_returned`] ?? 0),

          0,
        ),

        closing: rows.reduce(
          (sum, row) => sum + Number(row[`tray_${trayTypeId}_closing`] ?? 0),

          0,
        ),
      };
    }

    return {
      columns,
      rows,
      totals,
    };
  }
}
