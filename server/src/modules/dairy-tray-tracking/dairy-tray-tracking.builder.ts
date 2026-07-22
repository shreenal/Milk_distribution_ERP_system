import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { SaveDairyTrayEntryDto } from './dto/save-dairy-tray-entry.dto.js';
import {
  Vehicle,
  BuildDairyTrayGridParams,
  TrayType,
  ProductTrayRule,
  DairyTrayTransaction,
  DairyTrayGrid,
  DairyTrayRow,
  DairyTrayTotals,
  TrayColumnNode,
  Product,
  PurchaseEntry,
} from '../../types/dairy-tray-tracking.types.js';

@Injectable()
export class DairyTrayTrackingBuilder {
  buildDairyTrayGrid({
    vehicles,
    trayTypes,
    purchaseEntries,
    trayRules,
    previousTransactions,
    currentTransactions,
  }: BuildDairyTrayGridParams): DairyTrayGrid {
    const columns = this.buildTrayColumns(trayTypes);

    const takenMap = this.buildTakenMapFromPurchaseEntries(
      purchaseEntries,
      trayRules,
    );

    const rows = this.buildRows(
      vehicles,
      trayTypes,
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

  private buildTrayColumns(trayTypes: TrayType[]): TrayColumnNode[] {
    const brandMap = new Map<
      string,
      {
        headerName: string;
        children: TrayColumnNode[];
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
    takenMap: Map<number, Map<number, number>>,
    previousTransactions: DairyTrayTransaction[],
    currentTransactions: DairyTrayTransaction[],
  ): DairyTrayRow[] {
    const rows: DairyTrayRow[] = [];

    const trayFields = this.initializeTrayFields(trayTypes);

    for (const vehicle of vehicles) {
      const row: DairyTrayRow = {
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicle_name,
        ...structuredClone(trayFields),
      };

      const vehicleTaken = takenMap.get(vehicle.id);

      for (const trayType of trayTypes) {
        const previous = previousTransactions.find(
          (transaction) =>
            transaction.vehicle_id === vehicle.id &&
            transaction.tray_type_id === trayType.id,
        );

        const current = currentTransactions.find(
          (transaction) =>
            transaction.vehicle_id === vehicle.id &&
            transaction.tray_type_id === trayType.id,
        );

        const opening = previous?.closing_balance ?? 0;

        const taken = vehicleTaken?.get(trayType.id) ?? 0;

        const returned = current?.trays_returned ?? 0;

        const closing = opening + taken - returned;

        row[`tray_${trayType.id}_opening`] = opening;
        row[`tray_${trayType.id}_taken`] = taken;
        row[`tray_${trayType.id}_returned`] = returned;
        row[`tray_${trayType.id}_closing`] = closing;
      }

      rows.push(row);
    }

    return rows;
  }

  private findMatchingTrayRule(
    product: Product,
    trayRules: ProductTrayRule[],
  ): ProductTrayRule | null {
    const matchingRules = trayRules.filter((rule) => {
      const baseMatch =
        (rule.brand_id === null || rule.brand_id === product.brand_id) &&
        (rule.product_group_id === null ||
          rule.product_group_id === product.product_group_id) &&
        (rule.product_type_id === null ||
          rule.product_type_id === product.product_type_id);

      if (!baseMatch) {
        return false;
      }

      if (rule.applies_to_packaging) {
        return rule.packaging_type_id === product.packaging_type_id;
      }

      return true;
    });

    if (matchingRules.length === 0) {
      return null;
    }

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

    return matchingRules[0];
  }

  private buildTakenMapFromPurchaseEntries(
    purchaseEntries: PurchaseEntry[],
    trayRules: ProductTrayRule[],
  ): Map<number, Map<number, number>> {
    const takenMap = new Map<number, Map<number, number>>();

    for (const entry of purchaseEntries) {
      const trayRule = this.findMatchingTrayRule(
        entry.master_product,
        trayRules,
      );

      if (!trayRule) {
        continue;
      }

      let vehicleMap = takenMap.get(entry.vehicle_id);

      if (!vehicleMap) {
        vehicleMap = new Map<number, number>();
        takenMap.set(entry.vehicle_id, vehicleMap);
      }

      const currentTaken = vehicleMap.get(trayRule.tray_type_id) ?? 0;

      vehicleMap.set(
        trayRule.tray_type_id,
        currentTaken + Number(entry.purchased_qty),
      );
    }

    return takenMap;
  }

  private buildTotals(
    rows: DairyTrayRow[],
    trayTypes: TrayType[],
  ): DairyTrayTotals {
    const totals: DairyTrayTotals = {
      totalVehicles: rows.length,
    };

    for (const trayType of trayTypes) {
      let opening = 0;
      let taken = 0;
      let returned = 0;
      let closing = 0;

      for (const row of rows) {
        opening += Number(row[`tray_${trayType.id}_opening`] ?? 0);
        taken += Number(row[`tray_${trayType.id}_taken`] ?? 0);
        returned += Number(row[`tray_${trayType.id}_returned`] ?? 0);
        closing += Number(row[`tray_${trayType.id}_closing`] ?? 0);
      }

      totals[`tray_${trayType.id}`] = {
        opening,
        taken,
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
      row[`tray_${trayType.id}_taken`] = 0;
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
    const takenMap = this.buildTakenMapFromPurchaseEntries(
      purchaseEntries,
      trayRules,
    );

    const transactions: Prisma.dairy_tray_transactionCreateManyInput[] = [];

    for (const entry of trayentries) {
      const previous = previousTransactions.find(
        (transaction) =>
          transaction.vehicle_id === entry.vehicleId &&
          transaction.tray_type_id === entry.trayTypeId,
      );

      const openingBalance = previous?.closing_balance ?? 0;

      const traysTaken =
        takenMap.get(entry.vehicleId)?.get(entry.trayTypeId) ?? 0;

      const traysReturned = entry.returned;

      const closingBalance = openingBalance + traysTaken - traysReturned;

      transactions.push({
        dairy_tray_paper_id: dairyTrayPaperId,

        vehicle_id: entry.vehicleId,

        tray_type_id: entry.trayTypeId,

        opening_balance: openingBalance,

        trays_taken: traysTaken,

        trays_returned: traysReturned,

        closing_balance: closingBalance,
      });
    }

    return transactions;
  }
}
