import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { OrderCommercialService } from '../src/modules/transactions/orders/services/order-commercial.service.js';
import { OrdersValidationService } from '../src/modules/transactions/orders/services/orders-validation.service.js';
import { makeBilling, newPg, product, sheet } from './helper.js';

describe('S-01 composite key split("_") breaks NON_MILK', () => {
  const run = async (category: string) => {
    const seen: any = {};
    const repo: any = {
      getProductsWithGroupBatch: async () =>
        new Map([
          [
            10,
            {
              brand_id: 1,
              product_group_id: 2,
              gst_percentage: 0,
              is_gst_inclusive: false,
              master_product_group: { category },
            },
          ],
        ]),
      getClientCategorySuppliersBatch: async (pairs: any) => {
        seen.supplierPairs = pairs;
        return new Map([[`7_${category}`, 3]]);
      },
      getProcurementRulesBatch: async (t: any) => {
        seen.triples = t;
        return new Map([[`1_${category}_2`, [3]]]);
      },
      getProductPrioritiesBatch: async () => new Map(),
      getProductLinksForPairsBatch: async () =>
        new Map([['3_10', { id: 99, distributor_id: 3, product_id: 10 }]]),
    };
    const svc = new OrderCommercialService(repo);
    const res = await svc.resolveBatch(
      [{ clientId: 7, productId: 10 }],
      5,
      {} as any,
    );
    return { seen, res };
  };
  it('control: MILK round-trips', async () => {
    const { seen } = await run('MILK');
    expect(seen.supplierPairs).toEqual([{ clientId: 7, category: 'MILK' }]);
    expect(seen.triples).toEqual([
      { brandId: 1, category: 'MILK', productGroupId: 2 },
    ]);
  });
  it('NON_MILK keeps its category in supplier lookup', async () => {
    const { seen } = await run('NON_MILK');
    expect(seen.supplierPairs).toEqual([{ clientId: 7, category: 'NON_MILK' }]);
  });
  it('NON_MILK keeps category + numeric productGroupId in procurement lookup', async () => {
    const { seen } = await run('NON_MILK');
    expect(seen.triples).toEqual([
      { brandId: 1, category: 'NON_MILK', productGroupId: 2 },
    ]);
  });
});

describe('S-02 reopened morning save ignores frozen GST', () => {
  const frozen = () => ({
    product_link_id: 100,
    units_per_order_unit: 1,
    pricing_quantity: 1,
    pricing_unit: 'L',
    final_selling_rate: 20,
    final_gst_percentage: 5,
    final_gst_inclusive: true,
    delivered_qty: 10,
    // master data changed AFTER finalization: 12% exclusive
    master_product: { gst_percentage: 12, is_gst_inclusive: false },
  });
  it('uses frozen 5%/inclusive for amounts AND stored percentage', async () => {
    const { billing, captured } = makeBilling({
      existing: new Map([['7_10', frozen()]]),
    });
    await billing.saveMorningEntriesBatch(
      {} as any,
      sheet('REOPENED') as any,
      1,
      [{ clientId: 7, productId: 10, deliveredQty: 10 }],
    );
    const r = captured.updates[0];
    // inclusive 5%: 10*20=200 final, taxable 190.48, gst 9.52
    expect(r.final_bill_amount).toBe(200);
    expect(r.final_gst_amount).toBe(9.52);
    expect(r.final_gst_percentage).toBe(5);
    expect(r.final_gst_inclusive).toBe(true);
  });
  it('stored flag and stored amounts are mutually consistent', async () => {
    const { billing, captured } = makeBilling({
      existing: new Map([['7_10', frozen()]]),
    });
    await billing.saveMorningEntriesBatch(
      {} as any,
      sheet('REOPENED') as any,
      1,
      [{ clientId: 7, productId: 10, deliveredQty: 10 }],
    );
    const r = captured.updates[0];
    // if flag says inclusive, final must equal qty*rate (no GST added on top)
    expect(
      r.final_gst_inclusive
        ? r.final_bill_amount === 200
        : r.final_bill_amount === 200 * (1 + r.final_gst_percentage / 100),
    ).toBe(true);
  });
});

describe('S-03 re-raising a zeroed line (real Postgres)', () => {
  it('delivered_qty must not stay 0 after ordered 5 -> 0 -> 5; morning completeness must catch it', async () => {
    const pg = await newPg();
    const existing = new Map<string, any>();
    const { billing, fake } = makeBilling({
      pg,
      existing,
      rates: new Map([['7_100', 20]]),
    });
    const doNight = async (qty: number) =>
      billing.saveNightEntriesBatch(
        {} as any,
        sheet() as any,
        1,
        [{ clientId: 7, productId: 10, orderedQty: qty }],
        [],
      );
    const sync = async () => {
      const r = await pg.query('select * from order_sheet_items');
      existing.clear();
      for (const x of r.rows as any[])
        existing.set(`${x.client_id}_${x.product_id}`, {
          ...x,
          product_link: { distributor_id: 3 },
        });
    };
    await doNight(5);
    await sync();
    await doNight(0);
    await sync();
    await doNight(5);
    await sync();
    const row = (
      await pg.query(
        'select ordered_qty, delivered_qty, final_bill_amount from order_sheet_items',
      )
    ).rows[0] as any;
    console.log('S-03 row after 5->0->5:', row);
    expect(row.delivered_qty).toBeNull(); // expected: reset, i.e. "not yet delivered"
    expect(row.final_bill_amount).toBeNull();

    // And the gate that should block submit-morning:
    const val = new OrdersValidationService(
      {
        getMorningValidationItems: async () => [
          {
            id: 1,
            delivered_qty: row.delivered_qty,
            master_product: { code: 'P10' },
          },
        ],
      } as any,
      {} as any,
    );
    await expect(
      val.validateMorningEntriesComplete(1, {} as any),
    ).rejects.toThrow(/Delivered quantity missing/);
  }, 30000);
});
