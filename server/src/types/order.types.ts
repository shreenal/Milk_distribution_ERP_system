export interface OrderBillingInput {
  milkProducts;

  nonMilkProducts;

  milkClients;

  nonMilkClients;

  sheetItems;
}

export type BillingRow = {
  clientId: number;
  clientName: string;
  billAmount: number;
} & Record<string, number | string | null | undefined>;
