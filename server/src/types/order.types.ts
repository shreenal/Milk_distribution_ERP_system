import { Prisma } from '../generated/prisma/client.js';

type SheetItem = Prisma.order_sheet_itemsGetPayload<{
  select: {
    client_id: true;
    product_id: true;
    ordered_qty: true;
    delivered_qty: true;
    night_bill_amount: true;
    final_bill_amount: true;
  };
}>;

type Client = Prisma.master_clientGetPayload<{
  select: {
    id: true;
    name: true;
  };
}>;

type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export interface OrderBillingInput {
  milkProducts: Product[];
  nonMilkProducts: Product[];
  milkClients: Client[];
  nonMilkClients: Client[];
  sheetItems: SheetItem[];
}

export type BillingRow = {
  clientId: number;
  clientName: string;
  billAmount: number;
} & Record<string, number | string | null | undefined>;
