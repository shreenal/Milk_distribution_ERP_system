import { Injectable } from '@nestjs/common';

@Injectable()
export class TrayBillingBuilder {
  async buildTrayBilling(data: {
    clients: any[];

    trayTypes: any[];

    sheetItems: any[];

    trayRules: any[];

    trayTransactions: any[];

    openingBalanceMap: Map<string, number>;
  }) {
    const {
      clients,

      trayTypes,

      sheetItems,

      trayRules,

      trayTransactions,

      openingBalanceMap,
    } = data;

    // =========================
    // COLUMNS
    // =========================

    const columns = this.buildTrayColumns(trayTypes);

    // =========================
    // ROWS
    // =========================

    const rows = clients.map((client) => {
      const row: any = {
        clientId: client.id,

        clientName: client.name,
      };

      // =========================
      // AUTO CALCULATE TRAYS TAKEN
      // =========================

      const clientItems = sheetItems.filter(
        (item) => item.client_id === client.id,
      );

      const expectedTrayMap = new Map<number, number>();

      const trayTakenMap = new Map<number, number>();

      for (const item of clientItems) {
        const matchingRules = trayRules.filter((rule) => {
          return (
            (rule.brand_id === null ||
              rule.brand_id === item.master_product.brand_id) &&
            (rule.product_group_id === null ||
              rule.product_group_id === item.master_product.product_group_id) &&
            (rule.product_type_id === null ||
              rule.product_type_id === item.master_product.product_type_id) &&
            (rule.packaging_type_id === null ||
              rule.packaging_type_id === item.master_product.packaging_type_id)
          );
        });

        if (matchingRules.length === 0) {
          continue;
        }

        // =========================
        // MOST SPECIFIC RULE WINS
        // =========================

        matchingRules.sort((a, b) => {
          const aSpecificity =
            Number(a.brand_id !== null) +
            Number(a.product_group_id !== null) +
            Number(a.product_type_id !== null) +
            Number(a.packaging_type_id !== null);

          const bSpecificity =
            Number(b.brand_id !== null) +
            Number(b.product_group_id !== null) +
            Number(b.product_type_id !== null) +
            Number(b.packaging_type_id !== null);

          return bSpecificity - aSpecificity;
        });

        const rule = matchingRules[0];

        const trayTypeId = rule.tray_type_id;
        const orderedQty = Number(item.ordered_qty ?? 0);

        const deliveredQty = Number(item.delivered_qty ?? 0);

        // ========================= // TRAY CALCULATION // ========================= // ordered_qty already represents // tray shorthand count
        const expectedTraysTaken = orderedQty; // delivered_qty may contain // fractional tray shorthand // because of leakage
        const traysTaken = Math.round(deliveredQty);

        const existingExpected = expectedTrayMap.get(trayTypeId) ?? 0;

        expectedTrayMap.set(
          trayTypeId,

          existingExpected + expectedTraysTaken,
        );

        const existingActual = trayTakenMap.get(trayTypeId) ?? 0;

        trayTakenMap.set(
          trayTypeId,

          existingActual + traysTaken,
        );
      }

      // =========================
      // BUILD TRAY COLUMNS
      // =========================

      for (const trayType of trayTypes) {
        const trayTypeId = trayType.id;

        const savedTransaction = trayTransactions.find(
          (transaction) =>
            transaction.client_id === client.id &&
            transaction.tray_type_id === trayTypeId,
        );

        const opening = Number(
          openingBalanceMap.get(`${client.id}_${trayTypeId}`) ?? 0,
        );

        const expected = Number(expectedTrayMap.get(trayTypeId) ?? 0);

        const taken = Number(trayTakenMap.get(trayTypeId) ?? 0);

        const returned = Number(savedTransaction?.trays_returned ?? 0);

        const closing = opening + taken - returned;

        row[`tray_${trayTypeId}_opening`] = opening;

        row[`tray_${trayTypeId}_expected`] = expected;

        row[`tray_${trayTypeId}_taken`] = taken;

        row[`tray_${trayTypeId}_returned`] = returned;

        row[`tray_${trayTypeId}_closing`] = closing;
      }

      return row;
    });

    // =========================
    // TOTALS
    // =========================

    const totals: any = {
      totalClients: clients.length,
    };

    for (const trayType of trayTypes) {
      const trayTypeId = trayType.id;

      totals[`tray_${trayTypeId}`] = {
        opening: rows.reduce(
          (sum, row) => sum + Number(row[`tray_${trayTypeId}_opening`] ?? 0),

          0,
        ),

        taken: rows.reduce(
          (sum, row) => sum + Number(row[`tray_${trayTypeId}_taken`] ?? 0),

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

  private buildTrayColumns(trayTypes: any[]) {
    const brandMap = new Map();

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

      const brandGroup = brandMap.get(brandName);

      brandGroup.children.push({
        headerName: `${trayType.color} Tray`,

        children: [
          {
            headerName: 'Opening',

            field: `tray_${trayType.id}_opening`,

            editable: false,
          },

          {
            headerName: 'Expected',

            field: `tray_${trayType.id}_expected`,

            editable: false,
          },

          {
            headerName: 'Taken',

            field: `tray_${trayType.id}_taken`,

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
        headerName: 'Client',

        field: 'clientName',

        pinned: 'left',
      },

      ...Array.from(brandMap.values()),
    ];
  }
}
