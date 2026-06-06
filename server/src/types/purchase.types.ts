// src/types/purchase.types.ts

export interface PurchaseColumn {

    productId: number;

    brandId: number;

    brandName: string;

    productGroupId: number;

    productGroupName: string;

    productTypeId: number | null;

    productTypeName: string | null;

    packagingTypeId: number | null;

    packagingTypeName: string | null;

    packagingSize: number;

    packagingUnit: string;

    purchaseRate: number;

    columnKey: string;
}

export interface PurchaseRow {

    vehicleId: number;

    vehicleNumber: string;

    serialNumber: string | null;

    dairyId: number | null;

    gatepassDate: string | null;

    values: Record<string, number>;

    rowTotal: number;
}

export interface PurchaseSection {

    distributorId: number;

    distributorName: string;

    brandId: number;

    brandName: string;

    productGroupId: number;

    productGroupName: string;

    gatepassDate: string;

    saleDate: string;

    columns: PurchaseColumn[];

    rows: PurchaseRow[];

    totals: Record<string, number>;

    grandTotal: number;
}

export interface PurchaseResponse {

    purchasePaperId: number;

    orderPaperId: number;

    saleDate: string;

    sections: PurchaseSection[];
}