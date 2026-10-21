import { PricingUnit, Prisma } from '../generated/prisma/client.js';

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

export type UpsertRow = {
  order_sheet_id: number;
  client_id: number;
  product_id: number;
  product_link_id: number;
  ordered_qty: number;
  night_selling_rate: number | null;
  night_bill_amount: number;
  tray_type_id: number | null;
  units_per_order_unit: number;
  pricing_quantity: number;
  pricing_unit: PricingUnit;
  delivered_qty: number | null;
  final_selling_rate: number | null;
  final_gst_percentage: number | null;
  final_gst_amount: number | null;
  final_taxable_amount: number | null;
  final_bill_amount: number | null;
  owner_distributor_id: number | null;
  final_gst_inclusive: boolean | null;
  resolved_via_fallback: boolean;
};

export type DeliveredRow = {
  order_sheet_id: number;
  client_id: number;
  product_link_id: number;
  delivered_qty: number;
  final_selling_rate: number;
  final_gst_percentage: number;
  final_gst_amount: number;
  final_taxable_amount: number;
  final_bill_amount: number;
  final_gst_inclusive: boolean;
};
