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
  ) { }

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

  // private findMatchingTrayRule(
  //   product: Product,
  //   trayRules: ProductTrayRule[],
  // ): ProductTrayRule | null {
  //   const matchingRules = trayRules.filter((rule) => {
  //     const baseMatch =
  //       (rule.brand_id === null || rule.brand_id === product.brand_id) &&
  //       (rule.product_group_id === null ||
  //         rule.product_group_id === product.product_group_id) &&
  //       (rule.product_type_id === null ||
  //         rule.product_type_id === product.product_type_id);

  //     if (!baseMatch) {
  //       return false;
  //     }

  //     if (rule.applies_to_packaging) {
  //       return rule.packaging_type_id === product.packaging_type_id;
  //     }

  //     return true;
  //   });

  //   if (matchingRules.length === 0) {
  //     return null;
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

  //   return matchingRules[0];
  // }

  // private buildTakenMapFromPurchaseEntries(
  //   purchaseEntries: PurchaseEntry[],
  //   trayRules: ProductTrayRule[],
  // ): Map<number, Map<number, number>> {
  //   const takenMap = new Map<number, Map<number, number>>();

  //   for (const entry of purchaseEntries) {
  //     const trayRule =
  // this.traysCalculationService.resolveTrayRule(
  //   entry.master_product,
  //   trayRules,
  // );

  //     if (!trayRule) {
  //       continue;
  //     }

  //     let vehicleMap = takenMap.get(entry.vehicle_id);

  //     if (!vehicleMap) {
  //       vehicleMap = new Map<number, number>();
  //       takenMap.set(entry.vehicle_id, vehicleMap);
  //     }

  //     const currentTaken = vehicleMap.get(trayRule.tray_type_id) ?? 0;

  //     vehicleMap.set(
  //       trayRule.tray_type_id,
  //       currentTaken + Number(entry.purchased_qty),
  //     );
  //   }

  //   return takenMap;
  // }

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

  buildTrayTransactions(
    dairyTrayPaperId: number,
    trayentries: SaveDairyTrayEntryDto[],
    purchaseEntries: PurchaseEntry[],
    trayRules: ProductTrayRule[],
    previousTransactions: DairyTrayTransaction[],
  ): Prisma.dairy_tray_transactionCreateManyInput[] {
    const takenMap =
      this.trayCalculationService.buildTakenMapFromPurchaseEntries(
        purchaseEntries,
        trayRules,
      );

    const transactions: Prisma.dairy_tray_transactionCreateManyInput[] = [];

    for (const entry of trayentries) {
      const key = `${entry.vehicleId}_${entry.deliverySession}_${entry.trayTypeId}`;

      const previous = previousTransactions.find(
        (transaction) =>
          transaction.vehicle_id === entry.vehicleId &&
          transaction.tray_type_id === entry.trayTypeId &&
          transaction.delivery_session === entry.deliverySession,
      );

      const openingBalance = Number(previous?.closing_balance ?? 0);

      const traysTaken =
        takenMap
          .get(entry.vehicleId)
          ?.get(entry.deliverySession)
          ?.get(entry.trayTypeId) ?? 0;

      const traysReturned = entry.returned;

      const transaction = this.trayCalculationService.buildTransaction(
        openingBalance,
        traysTaken,
        traysReturned,
      );

      transactions.push({
        dairy_tray_paper_id: dairyTrayPaperId,
        vehicle_id: entry.vehicleId,
        tray_type_id: entry.trayTypeId,
        delivery_session: entry.deliverySession,
        ...transaction,
      });
    }

    return transactions;
  }
}
