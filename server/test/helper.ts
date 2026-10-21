import 'reflect-metadata';
import { PGlite } from '@electric-sql/pglite';
import { OrdersRepository } from '../src/modules/transactions/orders/orders.repository.js';
import { BillingService } from '../src/modules/transactions/orders/services/billing.service.js';
import { OrderCommercialService } from '../src/modules/transactions/orders/services/order-commercial.service.js';
import { NightBillingService } from '../src/modules/transactions/orders/services/night-billing.service.js';
import { FinalBillingService } from '../src/modules/transactions/orders/services/final-billing.service.js';
import { TrayCalculationService } from '../src/common/calculators/tray-calculation.service.js';

export const DDL = `
CREATE TYPE "PricingUnit" AS ENUM ('L','KG');
CREATE TABLE order_sheet_items (
  id serial primary key, order_sheet_id int not null, client_id int not null, product_id int not null,
  created_at timestamp(3) not null default now(), updated_at timestamp(3) not null default now(),
  delivered_qty numeric(10,2), final_bill_amount numeric(12,2), ordered_qty numeric(10,2),
  final_gst_amount numeric(12,2), final_gst_percentage numeric(5,2), final_selling_rate numeric(10,2),
  final_taxable_amount numeric(12,2), night_bill_amount numeric(12,2), night_selling_rate numeric(10,2),
  product_link_id int not null, tray_type_id int, units_per_order_unit int not null,
  pricing_quantity numeric(10,3) not null, pricing_unit "PricingUnit" not null,
  final_gst_inclusive boolean, owner_distributor_id int,
  UNIQUE (order_sheet_id, client_id, product_link_id),
  UNIQUE (order_sheet_id, client_id, product_id));`;

export async function newPg() {
  const pg = new PGlite();
  await pg.exec(DDL);
  return pg;
}

/** Prisma-like db whose $executeRaw runs on real Postgres (PGlite). */
export const pgDb = (pg: PGlite) => ({
  $executeRaw: async (q: any) =>
    (await pg.query(q.text, q.values)).affectedRows ?? 0,
});

export const realRepo = () => new OrdersRepository({} as any);

export function upsertRow(o: Partial<any> = {}) {
  return {
    order_sheet_id: 1,
    client_id: 7,
    product_id: 10,
    product_link_id: 100,
    ordered_qty: 5,
    night_selling_rate: 20,
    night_bill_amount: 100,
    tray_type_id: null,
    units_per_order_unit: 1,
    pricing_quantity: 1,
    pricing_unit: 'L',
    delivered_qty: null,
    final_selling_rate: null,
    final_gst_percentage: null,
    final_gst_amount: null,
    final_taxable_amount: null,
    final_bill_amount: null,
    owner_distributor_id: 3,
    final_gst_inclusive: null,
    ...o,
  } as any;
}

export const product = (o: any = {}) => ({
  id: 10,
  brand_id: 1,
  product_group_id: 2,
  product_type_id: null,
  packaging_type_id: null,
  gst_percentage: 5,
  is_gst_inclusive: false,
  code: 'P10',
  product_order_unit: {
    units_per_order_unit: 1,
    pricing_quantity: 1,
    pricing_unit: 'L',
  },
  master_product_group: { name: 'g', category: 'MILK' },
  ...o,
});

export const sheet = (status = 'DRAFT') => ({
  id: 1,
  group_id: 5,
  order_paper_id: 9,
  order_paper: { status, sale_date: new Date('2026-10-09T00:00:00Z') },
});

/** BillingService over an in-memory fake repo; upserts are delegated to real SQL (PGlite) when `pg` is given. */
export function makeBilling(
  opts: {
    pg?: PGlite;
    existing?: Map<string, any>;
    rates?: Map<string, any>;
    products?: Map<number, any>;
    resolveBatch?: any;
  } = {},
) {
  const real = realRepo();
  const captured: { upserts: any[]; updates: any[] } = {
    upserts: [],
    updates: [],
  };
  const fake: any = {
    findSheetItemsByProductBatch: async () => opts.existing ?? new Map(),
    getProductsWithPackagingBatch: async () =>
      opts.products ?? new Map([[10, product()]]),
    getSellingRatesBatch: async () => opts.rates ?? new Map([['7_100', 20]]),
    getClientOwnersBatch: async () => new Map([[7, 3]]),
    upsertSheetEntriesBatch: async (rows: any[], db: any) => {
      captured.upserts.push(...rows);
      if (opts.pg)
        await real.upsertSheetEntriesBatch(rows, pgDb(opts.pg) as any);
    },
    updateDeliveredEntriesBatch: async (rows: any[], db: any) => {
      captured.updates.push(...rows);
      if (opts.pg)
        await real.updateDeliveredEntriesBatch(rows, pgDb(opts.pg) as any);
    },
  };
  const commercial: any = opts.resolveBatch
    ? { resolveBatch: opts.resolveBatch }
    : {
        resolveBatch: async (pairs: any[]) =>
          new Map(
            pairs.map((p) => [
              `${p.clientId}_${p.productId}`,
              {
                distributorId: 3,
                productLinkId: 100,
                gstPercentage: 5,
                gstInclusive: false,
                resolvedViaFallback: false,
              },
            ]),
          ),
      };
  const billing = new BillingService(
    fake,
    commercial,
    new NightBillingService(),
    new FinalBillingService(),
    new TrayCalculationService({} as any),
  );
  return { billing, captured, fake };
}
