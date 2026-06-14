export interface DeliverySummaryColumn {
  productId: number;

  brandId: number;
  brandName: string;

  productGroupId: number;
  productGroupName: string;

  productTypeId: number | null;
  productTypeName: string;

  packagingTypeId: number | null;
  packagingTypeName: string;

  packagingSize: number;
  packagingUnit: string;

  columnKey: string;
}

export interface DeliverySummaryRow {
  groupId: number;

  groupName: string;

  values: Record<string, number>;
}

export interface DeliverySummarySection {
  brandId: number;
  brandName: string;

  productGroupId: number;
  productGroupName: string;

  columns: DeliverySummaryColumn[];

  rows: DeliverySummaryRow[];

  totals: Record<string, number>;
}

export interface DeliverySummaryResponse {
  paperId: number;

  sections: DeliverySummarySection[];
}
