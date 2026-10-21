import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveNightEntriesRequestDto } from '../src/modules/transactions/orders/dto/save-night-entries.dto.js';
import {
  newPg,
  pgDb,
  realRepo,
  upsertRow,
  makeBilling,
  sheet,
} from './helper.js';

const PG_MAX_BIND_PARAMS = 65535;

describe('S-04 batch size vs bind-parameter limit', () => {
  it('DTO allows 5000 entries and the SQL then needs > 65535 params', async () => {
    let captured: any;
    const rows = Array.from({ length: 5000 }, (_, i) =>
      upsertRow({ client_id: i + 1 }),
    );
    await realRepo().upsertSheetEntriesBatch(rows, {
      $executeRaw: async (q: any) => {
        captured = q;
      },
    } as any);
    console.log(
      'S-04 params for 5000 rows =',
      captured.values.length,
      '(limit 65535, max rows/stmt =',
      Math.floor(PG_MAX_BIND_PARAMS / (captured.values.length / 5000)),
      ')',
    );
    const dto = plainToInstance(SaveNightEntriesRequestDto, {
      entries: rows.map((r) => ({
        clientId: r.client_id,
        productId: 10,
        orderedQty: 1,
      })),
    });
    expect(await validate(dto)).toHaveLength(0); // DTO accepts 5000
    expect(captured.values.length).toBeLessThanOrEqual(PG_MAX_BIND_PARAMS); // expected: chunked / capped
  });
  it('real Postgres executes a 3500-row and a 5000-row upsert', async () => {
    for (const n of [3500, 5000]) {
      const pg = await newPg();
      const rows = Array.from({ length: n }, (_, i) =>
        upsertRow({ client_id: i + 1, product_link_id: 100 }),
      );
      await expect(
        realRepo().upsertSheetEntriesBatch(rows, pgDb(pg) as any),
      ).resolves.not.toThrow();
    }
  }, 120000);
  it('default Express body limit (100kb) rejects a full 5000-entry body before validation', () => {
    const body = JSON.stringify({
      entries: Array.from({ length: 5000 }, (_, i) => ({
        clientId: 1000 + i,
        productId: 120,
        orderedQty: 12.5,
      })),
    });
    console.log('S-04 body bytes for 5000 entries =', body.length);
    expect(body.length).toBeLessThan(100 * 1024);
  });
});

describe('S-05 untyped params in UPDATE ... FROM (VALUES ...) (real Postgres)', () => {
  it('morning batch update executes with numbers + NULL-free rows', async () => {
    const pg = await newPg();
    await realRepo().upsertSheetEntriesBatch([upsertRow()], pgDb(pg) as any);
    const row = {
      order_sheet_id: 1,
      client_id: 7,
      product_link_id: 100,
      delivered_qty: 4.5,
      final_selling_rate: 20,
      final_gst_percentage: 5,
      final_gst_amount: 4.29,
      final_taxable_amount: 85.71,
      final_bill_amount: 90,
      final_gst_inclusive: true,
    };
    await expect(
      realRepo().updateDeliveredEntriesBatch([row], pgDb(pg) as any),
    ).resolves.not.toThrow();
    const r: any = (
      await pg.query(
        'select delivered_qty, final_bill_amount from order_sheet_items',
      )
    ).rows[0];
    expect(Number(r.delivered_qty)).toBe(4.5);
  });
});

describe('S-06 raw now() vs UTC (real Postgres, session TZ = Asia/Kolkata)', () => {
  it('raw upsert timestamps equal UTC wall-clock', async () => {
    const pg = await newPg();
    await pg.exec("SET TIME ZONE 'Asia/Kolkata'");
    await realRepo().upsertSheetEntriesBatch([upsertRow()], pgDb(pg) as any);
    const r: any = (
      await pg.query(
        "select created_at, (now() at time zone 'UTC') as utc_now from order_sheet_items",
      )
    ).rows[0];
    console.log(
      'S-06 created_at =',
      r.created_at.toISOString(),
      ' utc_now =',
      r.utc_now.toISOString(),
    );
    expect(Math.abs(r.created_at.getTime() - r.utc_now.getTime())).toBeLessThan(
      5000,
    );
  });
});

describe('S-07 second unique constraint is not the ON CONFLICT arbiter', () => {
  it('raw 23505 on (sheet,client,product) when link differs', async () => {
    const pg = await newPg();
    const repo = realRepo();
    await repo.upsertSheetEntriesBatch(
      [upsertRow({ product_link_id: 100 })],
      pgDb(pg) as any,
    );
    let err: any;
    try {
      await repo.upsertSheetEntriesBatch(
        [upsertRow({ product_link_id: 101 })],
        pgDb(pg) as any,
      );
    } catch (e) {
      err = e;
    }
    console.log('S-07 error:', err?.message, err?.code, err?.constraint);
    expect(err).toBeUndefined(); // expected by the review: clean handling; actual: raw unique violation
  });
  it('...but the sequential service path never produces a different link for an existing (client,product)', async () => {
    const existing = new Map([
      [
        '7_10',
        {
          product_link_id: 100,
          product_link: { distributor_id: 3 },
          units_per_order_unit: 1,
          pricing_quantity: 1,
          pricing_unit: 'L',
          tray_type_id: null,
        },
      ],
    ]);
    const { billing, captured } = makeBilling({
      existing,
      resolveBatch: async () =>
        new Map([
          [
            '7_10',
            {
              distributorId: 4,
              productLinkId: 101,
              gstPercentage: 0,
              gstInclusive: false,
              resolvedViaFallback: false,
            },
          ],
        ]),
    });
    await billing.saveNightEntriesBatch(
      {} as any,
      sheet() as any,
      1,
      [{ clientId: 7, productId: 10, orderedQty: 3 }],
      [],
    );
    expect(captured.upserts[0].product_link_id).toBe(100); // existing link is reused -> S-07 only reachable via races
  });
});
