import { Injectable } from '@nestjs/common';

import {
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import {
  TrayClient,
  ClientTraySheetItem,
  ClientTrayTransaction,
  ClientTrayColumnNode,
  ClientTrayGrid,
  ClientTrayRow,
  ClientTrayTotals,
} from '../../../types/client-trays.types.js';

import type { ProductTrayRule, TrayType } from '../../../types/tray.types.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

@Injectable()
export class ClientTraysBuilder {
  constructor(
    private readonly trayCalculationService: TrayCalculationService,
  ) {}
  buildTrayBilling(
    data: {
      milkClients: TrayClient[];
      nonMilkClients: TrayClient[];
      trayTypes: TrayType[];
      sheetItems: ClientTraySheetItem[];
      trayRules: ProductTrayRule[];
      trayTransactions: ClientTrayTransaction[];
      openingBalanceMap: Map<string, number>;
    },
    paperStatus: OrderPaperStatus,
  ) {
    const milkSheetItems = data.sheetItems.filter(
      (item) =>
        item.master_product.master_product_group.category ===
        SupplyCategory.MILK,
    );

    const nonMilkSheetItems = data.sheetItems.filter(
      (item) =>
        item.master_product.master_product_group.category ===
        SupplyCategory.NON_MILK,
    );

    const milkTrayTypes = this.getTrayTypesForItems(
      milkSheetItems,
      data.trayRules,
      data.trayTypes,
    );

    const nonMilkTrayTypes = this.getTrayTypesForItems(
      nonMilkSheetItems,
      data.trayRules,
      data.trayTypes,
    );

    const useOrderedQuantity =
      paperStatus === OrderPaperStatus.DRAFT ||
      paperStatus === OrderPaperStatus.REOPENED;

    const milkTrayGrid = this.buildGrid({
      ...data,
      clients: data.milkClients,
      sheetItems: milkSheetItems,
      trayTypes: milkTrayTypes,
      useOrderedQuantity,
    });

    const nonMilkTrayGrid = this.buildGrid({
      ...data,
      clients: data.nonMilkClients,
      sheetItems: nonMilkSheetItems,
      trayTypes: nonMilkTrayTypes,
      useOrderedQuantity,
    });

    return {
      milkTrayGrid,
      nonMilkTrayGrid,
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

  private buildGrid(data: {
    clients: TrayClient[];
    trayTypes: TrayType[];
    sheetItems: ClientTraySheetItem[];
    trayRules: ProductTrayRule[];
    trayTransactions: ClientTrayTransaction[];
    openingBalanceMap: Map<string, number>;
    useOrderedQuantity: boolean;
  }): ClientTrayGrid {
    const {
      clients,
      trayTypes,
      sheetItems,
      trayRules,
      trayTransactions,
      openingBalanceMap,
    } = data;
    const columns = this.buildTrayColumns(trayTypes);

    // =========================
    // ROWS
    // =========================

    const rows = clients
      .map((client) => {
        const row: ClientTrayRow = {
          clientId: client.id,
          clientName: client.name,
        };

        // =========================
        // AUTO CALCULATE TRAYS TAKEN
        // =========================

        const clientItems = sheetItems.filter(
          (item) => item.client_id === client.id,
        );

        if (clientItems.length === 0) {
          return null;
        }

        // const expectedTrayMap = new Map<number, number>();

        // const trayTakenMap = new Map<number, number>();

        const trayCountMap = new Map<number, number>();

        for (const item of clientItems) {
          // const matchingRules = trayRules.filter((rule) => {
          //   const baseMatch =
          //     (rule.brand_id === null ||
          //       rule.brand_id === item.master_product.brand_id) &&
          //     (rule.product_group_id === null ||
          //       rule.product_group_id ===
          //         item.master_product.product_group_id) &&
          //     (rule.product_type_id === null ||
          //       rule.product_type_id === item.master_product.product_type_id);

          //   if (!baseMatch) {
          //     return false;
          //   }

          //   if (rule.applies_to_packaging) {
          //     return (
          //       rule.packaging_type_id === item.master_product.packaging_type_id
          //     );
          //   }

          //   return true;
          // });

          // if (matchingRules.length === 0) {
          //   continue;
          // }
          // // =========================
          // // MOST SPECIFIC RULE WINS
          // // =========================

          // matchingRules.sort((a, b) => {
          //   const aSpecificity =
          //     Number(a.brand_id !== null) +
          //     Number(a.product_group_id !== null) +
          //     Number(a.product_type_id !== null) +
          //     Number(a.packaging_type_id !== null);

          //   const bSpecificity =
          //     Number(b.brand_id !== null) +
          //     Number(b.product_group_id !== null) +
          //     Number(b.product_type_id !== null) +
          //     Number(b.packaging_type_id !== null);

          //   return bSpecificity - aSpecificity;
          // });

          // const rule = matchingRules[0];

          const rule = this.trayCalculationService.resolveTrayRule(
            item.master_product,
            trayRules,
          );

          if (!rule) {
            continue;
          }

          const trayTypeId = rule.tray_type_id;
          const orderedQty = Number(item.ordered_qty ?? 0);

          const deliveredQty = Number(item.delivered_qty ?? 0);
          const trays = this.trayCalculationService.calculateTraysTaken(
            orderedQty,
            deliveredQty,
            data.useOrderedQuantity,
          );

          // ========================= // TRAY CALCULATION // ========================= // ordered_qty already represents // tray shorthand count
          // const expectedTraysTaken = orderedQty;// delivered_qty may contain // fractional tray shorthand // because of leakage
          // const traysTaken = Math.round(deliveredQty);
          const existing = trayCountMap.get(trayTypeId) ?? 0;

          trayCountMap.set(trayTypeId, existing + trays);
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

          const trays = Number(trayCountMap.get(trayTypeId) ?? 0);

          const returned = Number(savedTransaction?.trays_returned ?? 0);

          const closing = this.trayCalculationService.calculateClosingBalance(
            opening,
            trays,
            returned,
          );

          row[`tray_${trayTypeId}_opening`] = opening;

          row[`tray_${trayTypeId}`] = trays;

          row[`tray_${trayTypeId}_returned`] = returned;

          row[`tray_${trayTypeId}_closing`] = closing;
        }

        return row;
      })
      .filter((row): row is ClientTrayRow => row !== null);

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

  private getTrayTypesForItems(
    sheetItems: ClientTraySheetItem[],
    trayRules: ProductTrayRule[],
    trayTypes: TrayType[],
  ): TrayType[] {
    const trayTypeIds = new Set<number>();

    for (const item of sheetItems) {
      //   const matchingRules = trayRules.filter((rule) => {
      //     const baseMatch =
      //       (rule.brand_id === null ||
      //         rule.brand_id === item.master_product.brand_id) &&
      //       (rule.product_group_id === null ||
      //         rule.product_group_id === item.master_product.product_group_id) &&
      //       (rule.product_type_id === null ||
      //         rule.product_type_id === item.master_product.product_type_id);

      //     if (!baseMatch) {
      //       return false;
      //     }

      //     if (rule.applies_to_packaging) {
      //       return (
      //         rule.packaging_type_id === item.master_product.packaging_type_id
      //       );
      //     }

      //     return true;
      //   });

      //   if (matchingRules.length === 0) {
      //     continue;
      //   }

      //   matchingRules.sort((a, b) => {
      //     const aSpecificity =
      //       Number(a.brand_id !== null) +
      //       Number(a.product_group_id !== null) +
      //       Number(a.product_type_id !== null) +
      //       Number(a.packaging_type_id !== null);

      //     const bSpecificity =
      //       Number(b.brand_id !== null) +
      //       Number(b.product_group_id !== null) +
      //       Number(b.product_type_id !== null) +
      //       Number(b.packaging_type_id !== null);

      //     return bSpecificity - aSpecificity;
      //   });

      //   trayTypeIds.add(matchingRules[0].tray_type_id);
      const rule = this.trayCalculationService.resolveTrayRule(
        item.master_product,
        trayRules,
      );

      if (!rule) {
        continue;
      }

      trayTypeIds.add(rule.tray_type_id);
    }

    return trayTypes.filter((trayType) => trayTypeIds.has(trayType.id));
  }
}
