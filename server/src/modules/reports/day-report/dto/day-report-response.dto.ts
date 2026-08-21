import { PurchaseVarianceSeverity } from 'src/types/purchase.types.js';
import {
  DeliverySession,
  SupplyCategory,
} from '../../../../generated/prisma/client.js';

export interface DayReportProduct {
  productId: number;
  productCode: string | null;
  brandName: string;
  productGroupName: string;
  productTypeName: string | null;
  packagingTypeName: string | null;
  packagingSize: number;
  packagingUnit: string;
}

export interface DayReportSalesRow {
  category: SupplyCategory;

  product: DayReportProduct;

  quantity: number;
  finalAmount: number;
}

export interface DayReportSales {
  rows: DayReportSalesRow[];

  milkTotal: number;
  nonMilkTotal: number;
  grandTotal: number;
}

export interface DayReportClientTraySummary {
  totalClients: number;

  totalTraysTaken: number;
  totalTraysReturned: number;
  totalNetMovement: number;
}

export interface DayReportClientTrayTypeSummary {
  trayTypeId: number;
  trayTypeName: string;
  brandName: string;

  clientsWithMovement: number;
  traysTaken: number;
  traysReturned: number;
  netMovement: number;
}

export interface DayReportClientTrayMovement {
  summary: DayReportClientTraySummary;

  trayTypes: DayReportClientTrayTypeSummary[];
}

export interface DayReportCollections {
  cash: number;
  officeAmountGiven: number;
  cheque: number;
  online: number;
  bankDeposit: number;
  grandTotal: number;
}

export interface DayReportPurchaseProduct {
  productId: number;
  productCode: string | null;
  productName: string;
}

export interface DayReportPurchaseRow {
  category: SupplyCategory;

  vehicleId: number;
  vehicleName: string;

  deliverySession: DeliverySession;

  product: DayReportPurchaseProduct;

  allocatedQty: number;
  purchasedQty: number;

  purchaseRate: number;
  purchaseAmount: number;

  variance: number;
  variancePercentage: number;
  varianceSeverity: PurchaseVarianceSeverity;
  hasVariance: boolean;
}

export interface DayReportPurchaseDistributor {
  distributorId: number;
  distributorName: string;

  rows: DayReportPurchaseRow[];

  totals: DayReportPurchaseTotals;
}

export interface DayReportPurchaseTotals {
  totalPurchaseAmount: number;
  totalAllocatedQty: number;
  totalPurchasedQty: number;
  totalVariance: number;
  variancePercentage: number;
}

export interface DayReportPurchase {
  distributors: DayReportPurchaseDistributor[];

  grandTotals: DayReportPurchaseTotals;
}

export interface DayReportDairyTrayRow {
  deliverySession: DeliverySession;

  vehicleId: number;
  vehicleName: string;

  openingBalance: number;
  traysTaken: number;
  traysReturned: number;
  closingBalance: number;

  remarks: string | null;
}

export interface DayReportTrayMovementType {
  trayTypeId: number;
  trayTypeName: string;
  brandName: string;

  rows: DayReportDairyTrayRow[];

  totals: {
    openingBalance: number;
    traysTaken: number;
    traysReturned: number;
    closingBalance: number;
  };
}

export interface DayReportDairyTrayMovement {
  trayTypes: DayReportTrayMovementType[];

  totals: {
    openingBalance: number;
    traysTaken: number;
    traysReturned: number;
    closingBalance: number;
  };
}

export interface DayReportDistributorTransferRow {
  productId: number;
  productCode: string | null;
  productName: string;

  transferQty: number;
}

export interface DayReportDistributorTransferGroup {
  supplierDistributorId: number;
  supplierDistributorName: string;

  ownerDistributorId: number;
  ownerDistributorName: string;

  brandId: number;
  brandName: string;

  productGroupId: number;
  productGroupName: string;

  rows: DayReportDistributorTransferRow[];

  totalTransferQty: number;
}

export interface DayReportDistributorTransfers {
  transfers: DayReportDistributorTransferGroup[];

  totalTransferQty: number;
}

export interface DayReportRouteSettlement {
  sheetId: number;
  routeName: string;

  routeCash: number;
  expenseTotal: number;
  routeNetCash: number;

  denominationTotal: number;
  difference: number;
}

export interface DayReportRouteExpense {
  id: number;

  sheetId: number;
  routeName: string;

  expenseTypeId: number;
  expenseTypeName: string;

  amount: number;
  remarks: string | null;
}

export interface DayReportRouteDenomination {
  sheetId: number;
  routeName: string;

  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;
  coins: number;

  denominationTotal: number;
}

export interface DayReportDirectCollection {
  id: number;

  employeeId: number;
  employeeName: string;

  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;
  coins: number;

  collectionAmount: number;

  remarks: string | null;
}

export interface DayReportBankDeposit {
  id: number;

  bankId: number;
  bankName: string;

  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;
  coins: number;

  depositAmount: number;

  depositReference: string | null;
  remarks: string | null;
}

export interface DayReportCashSettlementSummary {
  totalRouteCash: number;
  totalRouteExpenses: number;
  totalRouteNetCash: number;

  directCollectionCash: number;

  officeCash: number;

  totalDeposits: number;

  cashInHandAfterDeposits: number;
}

export interface DayReportCashRouteSettlement {
  routeSettlements: DayReportRouteSettlement[];

  routeExpenses: DayReportRouteExpense[];

  routeDenominations: DayReportRouteDenomination[];

  directCollections: DayReportDirectCollection[];

  bankDeposits: DayReportBankDeposit[];

  summary: DayReportCashSettlementSummary;
}
