import { Injectable, NotFoundException } from '@nestjs/common';

import { DayReportRepository } from './day-report.repository.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { CashSettlementCalculationService } from '../../../common/calculators/cash-settlement.calculator.js';

import {
  DayReportProduct,
  DayReportSales,
  DayReportSalesRow,
  DayReportCollections,
  DayReportPurchase,
  DayReportPurchaseDistributor,
  DayReportPurchaseRow,
  DayReportPurchaseTotals,
  DayReportDairyTrayMovement,
  DayReportTrayMovementType,
  DayReportClientTrayMovement,
  DayReportClientTrayTypeSummary,
  DayReportDistributorTransfers,
  DayReportDistributorTransferGroup,
  DayReportCashRouteSettlement,
  DayReportRouteSettlement,
  DayReportRouteExpense,
  DayReportRouteDenomination,
  DayReportDirectCollection,
  DayReportBankDeposit,
  DayReportCashSettlementSummary,
} from './dto/day-report-response.dto.js';

import {
  DeliverySession,
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';

@Injectable()
export class DayReportService {
  constructor(
    private readonly repository: DayReportRepository,
    private readonly purchaseVarianceCalculator: PurchaseVarianceCalculator,
    private readonly cashSettlementCalculator: CashSettlementCalculationService,
  ) {}

  async getDayReport(saleDate: Date) {
    const paper = await this.repository.findOrderPaperBySaleDate(saleDate);

    if (!paper) {
      throw new NotFoundException(
        `No finalized order paper found for sale date ${saleDate.toISOString()}`,
      );
    }

    const [
      salesData,
      collectionsData,
      purchaseData,
      dairyTrayData,
      clientTrayData,
      distributorTransferData,
      cashSettlementData,
      directCollectionsData,
      bankDepositsData,
    ] = await Promise.all([
      this.repository.getSalesData(paper.id),
      this.repository.getCollectionsData(paper.id),
      this.repository.getPurchaseData(paper.id),
      this.repository.getDairyTrayData(paper.id),
      this.repository.getClientTrayData(paper.id),
      this.repository.getDistributorTransferData(paper.id),
      this.repository.getCashSettlementData(paper.id),
      this.repository.getDirectCollectionsData(paper.id),
      this.repository.getBankDepositsData(paper.id),
    ]);

    const sales = this.buildSales(salesData);

    const collections = this.buildCollections(collectionsData);

    /*
     * Purchase cannot be completed until the repository also
     * provides vehicle-allocation quantities.
     */
    const purchase = await this.buildPurchase(paper.id, purchaseData);

    const dairyTrayMovement = this.buildDairyTrayMovement(dairyTrayData);

    const clientTrayMovement = this.buildClientTrayMovement(clientTrayData);

    const distributorTransfers = this.buildDistributorTransfers(
      distributorTransferData,
    );

    const cashRouteSettlement = this.buildCashRouteSettlement(
      cashSettlementData,
      directCollectionsData,
      bankDepositsData,
    );

    return {
      paper: {
        id: paper.id,
        saleDate: paper.sale_date,
        status: paper.status,
      },

      sales,
      collections,
      purchase,
      dairyTrayMovement,
      clientTrayMovement,
      distributorTransfers,
      cashRouteSettlement,
    };
  }

  private buildSales(
    data: Awaited<ReturnType<DayReportRepository['getSalesData']>>,
  ): DayReportSales {
    const productMap = new Map<number, DayReportSalesRow>();

    for (const item of data) {
      const quantity = Number(item.delivered_qty ?? 0);
      const finalAmount = Number(item.final_bill_amount ?? 0);

      const existing = productMap.get(item.product_id);

      if (existing) {
        existing.quantity += quantity;
        existing.finalAmount += finalAmount;
        continue;
      }

      productMap.set(item.product_id, {
        category: item.master_product.master_product_group.category,

        product: this.buildProduct(item.master_product),

        quantity,
        finalAmount,
      });
    }

    const rows = Array.from(productMap.values()).map((row) => ({
      ...row,
      quantity: Number(row.quantity.toFixed(2)),
      finalAmount: Number(row.finalAmount.toFixed(2)),
    }));

    const milkTotal = rows
      .filter((row) => row.category === SupplyCategory.MILK)
      .reduce((sum, row) => sum + row.finalAmount, 0);

    const nonMilkTotal = rows
      .filter((row) => row.category === SupplyCategory.NON_MILK)
      .reduce((sum, row) => sum + row.finalAmount, 0);

    return {
      rows,

      milkTotal: Number(milkTotal.toFixed(2)),
      nonMilkTotal: Number(nonMilkTotal.toFixed(2)),
      grandTotal: Number((milkTotal + nonMilkTotal).toFixed(2)),
    };
  }

  private buildProduct(product: {
    id: number;
    code: string | null;
    packaging_size: unknown;
    packaging_unit: string;
    master_brand: {
      id: number;
      name: string;
    };
    master_product_group: {
      id: number;
      name: string;
    };
    master_product_type: {
      id: number;
      name: string;
    } | null;
    master_packaging_type: {
      id: number;
      name: string;
    } | null;
  }): DayReportProduct {
    return {
      productId: product.id,
      productCode: product.code,

      brandName: product.master_brand.name,
      productGroupName: product.master_product_group.name,
      productTypeName: product.master_product_type?.name ?? null,
      packagingTypeName: product.master_packaging_type?.name ?? null,

      packagingSize: Number(product.packaging_size),
      packagingUnit: product.packaging_unit,
    };
  }

  private buildCollections(
    data: Awaited<ReturnType<DayReportRepository['getCollectionsData']>>,
  ): DayReportCollections {
    let cash = 0;
    let officeAmountGiven = 0;
    let cheque = 0;
    let online = 0;
    let bankDeposit = 0;

    for (const collection of data) {
      cash += Number(collection.cash_collection);
      officeAmountGiven += Number(collection.office_amount_given);
      cheque += Number(collection.cheque_collection);
      online += Number(collection.online_collection);
      bankDeposit += Number(collection.bank_deposit);
    }

    const grandTotal = cash + officeAmountGiven + cheque + online + bankDeposit;

    return {
      cash: Number(cash.toFixed(2)),
      officeAmountGiven: Number(officeAmountGiven.toFixed(2)),
      cheque: Number(cheque.toFixed(2)),
      online: Number(online.toFixed(2)),
      bankDeposit: Number(bankDeposit.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
    };
  }

  private async buildPurchase(
    paperId: number,
    purchaseData: Awaited<ReturnType<DayReportRepository['getPurchaseData']>>,
  ): Promise<DayReportPurchase> {
    const allocationData =
      await this.repository.getPurchaseAllocationData(paperId);

    const distributorMap = new Map<number, DayReportPurchaseDistributor>();

    let grandTotals: DayReportPurchaseTotals = {
      totalPurchaseAmount: 0,
      totalAllocatedQty: 0,
      totalPurchasedQty: 0,
      totalVariance: 0,
      variancePercentage: 0,
    };

    for (const entry of purchaseData) {
      const allocatedQty = this.findAllocatedQty(allocationData, entry);

      const purchasedQty = Number(entry.purchased_qty);
      const purchaseRate = Number(entry.purchase_rate);
      const purchaseAmount = Number(entry.purchase_amount);

      const variance = this.purchaseVarianceCalculator.calculate(
        allocatedQty,
        purchasedQty,
      );

      const row: DayReportPurchaseRow = {
        category: entry.category,

        vehicleId: entry.vehicle_id,
        vehicleName:
          entry.master_vehicle.vehicle_name ??
          entry.master_vehicle.vehicle_number,

        deliverySession: entry.delivery_session,

        product: {
          productId: entry.master_product.id,
          productCode: entry.master_product.code,
          productName: this.buildProductName(entry.master_product),
        },

        allocatedQty,
        purchasedQty,

        purchaseRate,
        purchaseAmount,

        variance: variance.variance,
        variancePercentage: variance.variancePercentage,
        varianceSeverity: variance.severity,
        hasVariance: variance.hasVariance,
      };

      let distributor = distributorMap.get(entry.distributor_id);

      if (!distributor) {
        distributor = {
          distributorId: entry.distributor_id,
          distributorName: entry.distributor.name,
          rows: [],
          totals: {
            totalPurchaseAmount: 0,
            totalAllocatedQty: 0,
            totalPurchasedQty: 0,
            totalVariance: 0,
            variancePercentage: 0,
          },
        };

        distributorMap.set(entry.distributor_id, distributor);
      }

      distributor.rows.push(row);

      distributor.totals.totalPurchaseAmount += purchaseAmount;

      distributor.totals.totalAllocatedQty += allocatedQty;

      distributor.totals.totalPurchasedQty += purchasedQty;

      distributor.totals.totalVariance += variance.variance;

      grandTotals.totalPurchaseAmount += purchaseAmount;

      grandTotals.totalAllocatedQty += allocatedQty;

      grandTotals.totalPurchasedQty += purchasedQty;

      grandTotals.totalVariance += variance.variance;
    }

    grandTotals.variancePercentage =
      grandTotals.totalAllocatedQty === 0
        ? 0
        : Number(
            (
              (Math.abs(grandTotals.totalVariance) /
                grandTotals.totalAllocatedQty) *
              100
            ).toFixed(2),
          );

    for (const distributor of distributorMap.values()) {
      distributor.totals.variancePercentage =
        distributor.totals.totalAllocatedQty === 0
          ? 0
          : Number(
              (
                (Math.abs(distributor.totals.totalVariance) /
                  distributor.totals.totalAllocatedQty) *
                100
              ).toFixed(2),
            );

      this.roundPurchaseTotals(distributor.totals);
    }

    this.roundPurchaseTotals(grandTotals);

    return {
      distributors: Array.from(distributorMap.values()),
      grandTotals,
    };
  }

  private roundPurchaseTotals(totals: DayReportPurchaseTotals): void {
    totals.totalPurchaseAmount = Number(totals.totalPurchaseAmount.toFixed(2));

    totals.totalAllocatedQty = Number(totals.totalAllocatedQty.toFixed(2));

    totals.totalPurchasedQty = Number(totals.totalPurchasedQty.toFixed(2));

    totals.totalVariance = Number(totals.totalVariance.toFixed(2));

    totals.variancePercentage = Number(totals.variancePercentage.toFixed(2));
  }

  private findAllocatedQty(
    allocationData: Awaited<
      ReturnType<DayReportRepository['getPurchaseAllocationData']>
    >,
    purchaseEntry: {
      vehicle_id: number;
      product_id: number;
      distributor_id: number;
      category: SupplyCategory;
      delivery_session: DeliverySession;
    },
  ): number {
    const allocation = allocationData.find(
      (item) =>
        item.vehicle_id === purchaseEntry.vehicle_id &&
        item.product_id === purchaseEntry.product_id &&
        item.distributor_id === purchaseEntry.distributor_id &&
        item.category === purchaseEntry.category &&
        item.vehicle_allocation_paper.delivery_session ===
          purchaseEntry.delivery_session,
    );

    return Number(allocation?.allocated_qty ?? 0);
  }

  private buildProductName(product: {
    master_brand: { name: string };
    master_product_group: { name: string };
  }): string {
    return `${product.master_brand.name} ${product.master_product_group.name}`;
  }

  private buildDairyTrayMovement(
    data: Awaited<ReturnType<DayReportRepository['getDairyTrayData']>>,
  ): DayReportDairyTrayMovement {
    const typeMap = new Map<number, DayReportTrayMovementType>();

    let totalOpeningBalance = 0;
    let totalTaken = 0;
    let totalReturned = 0;
    let totalClosingBalance = 0;

    for (const transaction of data) {
      const trayType = transaction.master_tray_type;

      let group = typeMap.get(transaction.tray_type_id);

      if (!group) {
        group = {
          trayTypeId: transaction.tray_type_id,
          trayTypeName: `${transaction.master_tray_type.master_brand.name} ${transaction.master_tray_type.color}`,
          brandName: trayType.master_brand.name,
          rows: [],
          totals: {
            openingBalance: 0,
            traysTaken: 0,
            traysReturned: 0,
            closingBalance: 0,
          },
        };

        typeMap.set(transaction.tray_type_id, group);
      }

      const opening = transaction.opening_balance;
      const taken = transaction.trays_taken;
      const returned = transaction.trays_returned;
      const closing = transaction.closing_balance;

      group.rows.push({
        deliverySession: transaction.delivery_session,

        vehicleId: transaction.vehicle_id,
        vehicleName:
          transaction.master_vehicle.vehicle_name ??
          transaction.master_vehicle.vehicle_number,

        openingBalance: opening,
        traysTaken: taken,
        traysReturned: returned,
        closingBalance: closing,

        remarks: transaction.remarks,
      });

      group.totals.openingBalance += opening;
      group.totals.traysTaken += taken;
      group.totals.traysReturned += returned;
      group.totals.closingBalance += closing;

      totalOpeningBalance += opening;
      totalTaken += taken;
      totalReturned += returned;
      totalClosingBalance += closing;
    }

    return {
      trayTypes: Array.from(typeMap.values()),

      totals: {
        openingBalance: totalOpeningBalance,
        traysTaken: totalTaken,
        traysReturned: totalReturned,
        closingBalance: totalClosingBalance,
      },
    };
  }

  private buildClientTrayMovement(
    data: Awaited<ReturnType<DayReportRepository['getClientTrayData']>>,
  ): DayReportClientTrayMovement {
    const typeMap = new Map<number, DayReportClientTrayTypeSummary>();

    const clients = new Set<number>();

    for (const transaction of data) {
      const taken = Number(transaction.trays_taken ?? 0);

      const returned = Number(transaction.trays_returned ?? 0);

      if (taken === 0 && returned === 0) {
        continue;
      }

      clients.add(transaction.client_id);

      let summary = typeMap.get(transaction.tray_type_id);

      if (!summary) {
        summary = {
          trayTypeId: transaction.tray_type_id,
          trayTypeName: `${transaction.master_tray_type.master_brand.name} ${transaction.master_tray_type.color}`,
          brandName: transaction.master_tray_type.master_brand.name,

          clientsWithMovement: 0,
          traysTaken: 0,
          traysReturned: 0,
          netMovement: 0,
        };

        typeMap.set(transaction.tray_type_id, summary);
      }

      summary.traysTaken += taken;
      summary.traysReturned += returned;
      summary.netMovement += taken - returned;
    }

    /*
     * A client may have multiple tray types.
     * Therefore clientsWithMovement must be counted
     * per tray type, not simply copied from the global
     * client count.
     */
    for (const summary of typeMap.values()) {
      const clientsForTrayType = new Set(
        data
          .filter(
            (transaction) =>
              transaction.tray_type_id === summary.trayTypeId &&
              (Number(transaction.trays_taken ?? 0) > 0 ||
                Number(transaction.trays_returned ?? 0) > 0),
          )
          .map((transaction) => transaction.client_id),
      );

      summary.clientsWithMovement = clientsForTrayType.size;

      summary.traysTaken = Number(summary.traysTaken.toFixed(2));

      summary.traysReturned = Number(summary.traysReturned.toFixed(2));

      summary.netMovement = Number(summary.netMovement.toFixed(2));
    }

    let totalTaken = 0;
    let totalReturned = 0;

    for (const summary of typeMap.values()) {
      totalTaken += summary.traysTaken;
      totalReturned += summary.traysReturned;
    }

    return {
      summary: {
        totalClients: clients.size,
        totalTraysTaken: Number(totalTaken.toFixed(2)),
        totalTraysReturned: Number(totalReturned.toFixed(2)),
        totalNetMovement: Number((totalTaken - totalReturned).toFixed(2)),
      },

      trayTypes: Array.from(typeMap.values()),
    };
  }

  private buildDistributorTransfers(
    data: Awaited<
      ReturnType<DayReportRepository['getDistributorTransferData']>
    >,
  ): DayReportDistributorTransfers {
    const groupMap = new Map<string, DayReportDistributorTransferGroup>();

    let totalTransferQty = 0;

    for (const transfer of data) {
      const key =
        `${transfer.supplier_distributor_id}_` +
        `${transfer.owner_distributor_id}_` +
        `${transfer.master_product.master_brand.id}_` +
        `${transfer.master_product.master_product_group.id}`;

      let group = groupMap.get(key);

      if (!group) {
        group = {
          supplierDistributorId: transfer.supplier_distributor_id,

          supplierDistributorName: transfer.supplier_distributor.name,

          ownerDistributorId: transfer.owner_distributor_id,

          ownerDistributorName: transfer.owner_distributor.name,

          brandId: transfer.master_product.master_brand.id,

          brandName: transfer.master_product.master_brand.name,

          productGroupId: transfer.master_product.master_product_group.id,

          productGroupName: transfer.master_product.master_product_group.name,

          rows: [],
          totalTransferQty: 0,
        };

        groupMap.set(key, group);
      }

      const quantity = Number(transfer.transfer_qty);

      group.rows.push({
  productId: transfer.master_product.id,
  productCode: transfer.master_product.code,
  productName: this.buildProductName(transfer.master_product),
  transferQty: quantity,
});

      group.totalTransferQty += quantity;
      totalTransferQty += quantity;
    }

    for (const group of groupMap.values()) {
      group.totalTransferQty = Number(group.totalTransferQty.toFixed(2));
    }

    return {
      transfers: Array.from(groupMap.values()),

      totalTransferQty: Number(totalTransferQty.toFixed(2)),
    };
  }

  private buildCashRouteSettlement(
    routeData: Awaited<
      ReturnType<DayReportRepository['getCashSettlementData']>
    >,
    directData: Awaited<
      ReturnType<DayReportRepository['getDirectCollectionsData']>
    >,
    depositData: Awaited<
      ReturnType<DayReportRepository['getBankDepositsData']>
    >,
  ): DayReportCashRouteSettlement {
    const routeSettlements: DayReportRouteSettlement[] = [];
    const routeExpenses: DayReportRouteExpense[] = [];
    const routeDenominations: DayReportRouteDenomination[] = [];

    for (const sheet of routeData) {
      const settlement = sheet.cash_route_settlement;

      const routeCash =
        this.cashSettlementCalculator.getRouteCashFromCollections(
          sheet.client_collection,
        );

      const expenseTotal =
        this.cashSettlementCalculator.getRouteExpenseTotalFromExpenses(
          settlement?.expenses ?? [],
        );

      const routeNetCash = routeCash - expenseTotal;

      const denominationTotal =
        this.cashSettlementCalculator.getDenominationAmountFromRow(settlement);

      routeSettlements.push({
        sheetId: sheet.id,
        routeName: sheet.master_group.name,

        routeCash,
        expenseTotal,
        routeNetCash,

        denominationTotal,
        difference: routeNetCash - denominationTotal,
      });

      if (!settlement) {
        continue;
      }

      for (const expense of settlement.expenses) {
        routeExpenses.push({
          id: expense.id,

          sheetId: sheet.id,
          routeName: sheet.master_group.name,

          expenseTypeId: expense.expense_type.id,
          expenseTypeName: expense.expense_type.name,

          amount: Number(expense.amount),
          remarks: expense.remarks,
        });
      }

      routeDenominations.push({
        sheetId: sheet.id,
        routeName: sheet.master_group.name,

        note2000: settlement.note_2000,
        note500: settlement.note_500,
        note200: settlement.note_200,
        note100: settlement.note_100,
        note50: settlement.note_50,
        note20: settlement.note_20,
        note10: settlement.note_10,
        coins: Number(settlement.coins),

        denominationTotal,
      });
    }

    const directCollections: DayReportDirectCollection[] = directData.map(
      (collection) => ({
        id: collection.id,

        employeeId: collection.employee_id,
        employeeName: collection.employee.name,

        note2000: collection.note_2000,
        note500: collection.note_500,
        note200: collection.note_200,
        note100: collection.note_100,
        note50: collection.note_50,
        note20: collection.note_20,
        note10: collection.note_10,
        coins: Number(collection.coins),

        collectionAmount:
          this.cashSettlementCalculator.getDenominationAmountFromRow(
            collection,
          ),

        remarks: collection.remarks,
      }),
    );

    const bankDeposits: DayReportBankDeposit[] = depositData.map((deposit) => ({
      id: deposit.id,

      bankId: deposit.bank_id,
      bankName: deposit.bank.name,

      note2000: deposit.note_2000,
      note500: deposit.note_500,
      note200: deposit.note_200,
      note100: deposit.note_100,
      note50: deposit.note_50,
      note20: deposit.note_20,
      note10: deposit.note_10,
      coins: Number(deposit.coins),

      depositAmount:
        this.cashSettlementCalculator.getDenominationAmountFromRow(deposit),

      depositReference: deposit.deposit_reference,
      remarks: deposit.remarks,
    }));

    const totalRouteCash =
      this.cashSettlementCalculator.getTotalRouteCash(routeSettlements);

    const totalRouteExpenses =
      this.cashSettlementCalculator.getTotalRouteExpenses(routeSettlements);

    const totalRouteNetCash =
      this.cashSettlementCalculator.getTotalRouteNetCashFromSettlements(
        routeSettlements,
      );

    const directCollectionCash =
      this.cashSettlementCalculator.getTotalDirectCollectionCash(
        directCollections,
      );

    const totalDeposits =
      this.cashSettlementCalculator.getTotalDeposits(bankDeposits);

    const officeCash = this.cashSettlementCalculator.getOfficeCash(
      totalRouteNetCash,
      directCollectionCash,
    );

    const cashInHandAfterDeposits =
      this.cashSettlementCalculator.getCashInHandAfterDeposits(
        officeCash,
        totalDeposits,
      );

    const summary: DayReportCashSettlementSummary = {
      totalRouteCash: Number(totalRouteCash.toFixed(2)),
      totalRouteExpenses: Number(totalRouteExpenses.toFixed(2)),
      totalRouteNetCash: Number(totalRouteNetCash.toFixed(2)),

      directCollectionCash: Number(directCollectionCash.toFixed(2)),

      officeCash: Number(officeCash.toFixed(2)),

      totalDeposits: Number(totalDeposits.toFixed(2)),

      cashInHandAfterDeposits: Number(cashInHandAfterDeposits.toFixed(2)),
    };

    return {
      routeSettlements,
      routeExpenses,
      routeDenominations,
      directCollections,
      bankDeposits,
      summary,
    };
  }
}
