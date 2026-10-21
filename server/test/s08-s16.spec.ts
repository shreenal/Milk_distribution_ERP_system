import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrdersValidationService } from '../src/modules/transactions/orders/services/orders-validation.service.js';
import { OrdersRepository } from '../src/modules/transactions/orders/orders.repository.js';
import { NightBillingService } from '../src/modules/transactions/orders/services/night-billing.service.js';
import { TrayCalculationService } from '../src/common/calculators/tray-calculation.service.js';
import {
  SaveNightEntriesRequestDto,
  SaveNightEntriesDto,
} from '../src/modules/transactions/orders/dto/save-night-entries.dto.js';
import { SaveMorningEntriesRequestDto } from '../src/modules/transactions/orders/dto/save-morning-entries.dto.js';
import { touchIfUnchanged } from '../src/common/prisma/touch-if-unchanged.util.js';
import { makeBilling, sheet, product } from './helper.js';
import { makeService } from './svc.js';

const SRC = path.resolve('src');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const val = (repo: any = {}) =>
  new OrdersValidationService(repo, new TrayCalculationService({} as any));

describe('S-08 save is not constrained to products on the sheet', () => {
  it('rejects a product that is not on the sheet', async () => {
    const db: any = {
      master_client: {
        findMany: async () => [
          {
            id: 7,
            name: 'C',
            is_active: true,
            delivery_group_id: 5,
            categories: [{ category: 'MILK' }],
          },
        ],
      },
      master_product: {
        findMany: async () => [
          {
            id: 10,
            is_active: true,
            brand_id: 1,
            product_group_id: 2,
            product_type_id: null,
            packaging_type_id: null,
            master_product_group: { category: 'MILK' },
          },
        ],
      },
      order_sheet_product: { findMany: async () => [] }, // product 10 was never added to this sheet
    };
    // signature has no sheetId at all -> sheet membership cannot be checked
    await expect(
      val().validateEntriesBatch([{ clientId: 7, productId: 10 }], 5, db),
    ).rejects.toThrow();
  });
});

describe('S-09 delivered <= ordered is not enforced', () => {
  it('over-delivery is rejected (policy: NEEDS-DECISION)', () => {
    expect(() =>
      val().validateDeliveredQuantity(15, {
        tray_type_id: null,
        ordered_qty: 5,
      } as any),
    ).toThrow();
  });
  it('delivery against a zeroed (ordered 0) line is rejected', () => {
    expect(() =>
      val().validateDeliveredQuantity(5, {
        tray_type_id: null,
        ordered_qty: 0,
      } as any),
    ).toThrow();
  });
});

describe('S-10 throttling', () => {
  it('night/morning save limits are not per-IP-shared-by-office', () => {
    const ctrl = read(
      '../src/modules/transactions/orders/orders.controller.ts',
    );

    expect(ctrl).toMatch(/night-save[\s\S]{0,120}limit: 10/);

    const guard = fs.readFileSync(
      'node_modules/@nestjs/throttler/dist/throttler.guard.js',
      'utf8',
    );

    expect(guard).toMatch(/getTracker/);

    console.log(
      'S-10 tracker:',
      /getTracker\(req\)[\s\S]{0,200}/
        .exec(guard)?.[0]
        .replace(/\s+/g, ' ')
        .slice(0, 160),
    );
  });
});

describe('S-11 optimistic concurrency is optional / incomplete', () => {
  it('expectedUpdatedAt is required on save DTOs', async () => {
    const dto = plainToInstance(SaveNightEntriesRequestDto, {
      entries: [{ clientId: 1, productId: 1, orderedQty: 1 }],
    });
    expect(
      (await validate(dto)).some((e) => e.property === 'expectedUpdatedAt'),
    ).toBe(true);
  });
  it('empty entries array is rejected', async () => {
    const dto = plainToInstance(SaveMorningEntriesRequestDto, { entries: [] });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it('touchIfUnchanged(null) does not detect a concurrent writer', async () => {
    const calls: any[] = [];
    const db = {
      updateMany: async (a: any) => {
        calls.push(a);
        return { count: 1 };
      },
    };
    await touchIfUnchanged(
      db as any,
      { id: 1 },
      'order_items_updated_at',
      null,
    );
    expect(calls[0].where).toHaveProperty('order_items_updated_at');
  });
  it('empty save must not touch timestamp / trigger propagation', async () => {
    const { svc, orch, repo } = makeService();
    await svc.saveNightEntriesService(1, [], undefined);
    expect(repo.touchOrderItemsIfUnchanged).not.toHaveBeenCalled();
    expect(orch.execute).not.toHaveBeenCalled();
  });
  it('addProduct / removeProduct participate in the optimistic-concurrency token', () => {
    const src = read('../src/modules/transactions/orders/orders.service.ts');
    const add = src.slice(
      src.indexOf('async addProductToSheet'),
      src.indexOf('async saveNightEntriesService'),
    );
    expect(add).toMatch(/touchOrderItemsIfUnchanged/);
  });
  it('save response returns the new itemsUpdatedAt (else next save 409s against itself)', async () => {
    const { svc } = makeService();
    const res: any = await svc.saveNightEntriesService(1, [], undefined);
    expect(res).toHaveProperty('itemsUpdatedAt');
  });
});

describe('S-12 declared-but-unused business rules', () => {
  it('every ERROR_MESSAGES / QUANTITY_PRECISION constant is referenced', () => {
    const consts = read(
      '../src/modules/transactions/orders/orders.constants.ts',
    );
    const names = [
      'DELIVERED_EXCEEDS_ORDERED',
      'CONFLICTING_DELIVERY_QTY',
      'QUANTITY_EXCEEDS_MAX',
      'NIGHT_ENTRY_INCOMPLETE',
      'PAST_DATE_NOT_ALLOWED',
      'FUTURE_DATE_TOO_FAR',
      'RATE_DECIMAL_PLACES',
      'AMOUNT_DECIMAL_PLACES',
      'INVALID_DATE_FORMAT',
      'CLIENT_NOT_IN_GROUP',
      'INVALID_SHEET_ID',
    ];
    const all = fs
      .readdirSync(SRC)
      .filter((f) => f !== 'orders_constants.ts' && f.endsWith('.ts'))
      .map((f) => read(f))
      .join('\n');
    const unused = names.filter(
      (n) => consts.includes(n) && !new RegExp(`\\b${n}\\b`).test(all),
    );
    console.log('S-12 unused constants:', unused);
    expect(unused).toEqual([]);
  });
  it('unused repository / service members', () => {
    const all = fs
      .readdirSync(SRC)
      .filter((f) => f.endsWith('.ts') && f !== 'orders.repository.ts')
      .map((f) => read(f))
      .join('\n');
    const members = [
      'upsertSheetEntry',
      'findSheetItem',
      'getProductLink',
      'getProductCategory',
      'getSheetProductLinksBatch',
      'getSheetCommercialContext',
      'createSheetItems',
      'getClientsByGroupId',
      'getEligibleDistributorsForProduct',
      'getSheetItemsByPaperId',
    ];
    const unused = members.filter((m) => !new RegExp(`\\.${m}\\(`).test(all));
    console.log('S-12 unused repo members:', unused);
    expect(unused).toEqual([]);
  });
  it('RemoveProductDto is imported somewhere', () => {
    const all = fs
      .readdirSync(SRC)
      .filter((f) => f.endsWith('.ts') && f !== 'remove-product.dto.ts')
      .map((f) => read(f))
      .join(' ');
    expect(all).toMatch(/RemoveProductDto/);
  });
});

describe('S-13 quantity precision', () => {
  const night = new NightBillingService();
  it('non-tray decimals beyond 2dp are rejected (or billing uses the rounded qty)', () => {
    expect(() =>
      val().validateOrderedQuantity(
        1.234,
        {
          brand_id: 1,
          product_group_id: 2,
          product_type_id: null,
          packaging_type_id: null,
        },
        [],
      ),
    ).toThrow();
  });
  it('billed amount == stored(rounded) qty x rate', () => {
    const raw = 1.234,
      stored = Math.round(raw * 100) / 100;
    expect(night.calculate(raw, 10, 1).nightBillAmount).toBe(
      night.calculate(stored, 10, 1).nightBillAmount,
    );
  });
  it('trays taken is consistent between ordered- and delivered-basis for fractional qty', () => {
    const t = new TrayCalculationService({} as any);
    expect(t.calculateTraysTaken(2.5, 2.5, true)).toBe(
      t.calculateTraysTaken(2.5, 2.5, false),
    );
  });
});

describe('S-14 night completeness blocks the whole paper', () => {
  it('a sheet with zero orders blocks submit (behaviour confirmed; needs business decision)', async () => {
    const v = val({ countPositiveOrderedItems: async () => 0 });
    await expect(
      v.validateNightEntriesComplete(1, 'Route A', {} as any),
    ).rejects.toThrow(/No orders entered/);
  });
});

describe('S-15 resave of an existing line with an expired rate', () => {
  const existing = () =>
    new Map([
      [
        '7_10',
        {
          product_link_id: 100,
          product_link: { distributor_id: 3 },
          units_per_order_unit: 1,
          pricing_quantity: 1,
          pricing_unit: 'L',
          tray_type_id: null,
          night_selling_rate: 18,
        },
      ],
    ]);
  it('unchanged existing line does not fail the batch when its rate has lapsed', async () => {
    const { billing } = makeBilling({ existing: existing(), rates: new Map() }); // no applicable rate any more
    await expect(
      billing.saveNightEntriesBatch(
        {} as any,
        sheet() as any,
        1,
        [{ clientId: 7, productId: 10, orderedQty: 3 }],
        [],
      ),
    ).resolves.not.toThrow();
  });
  it('resave keeps the previously frozen night rate when rate master changed', async () => {
    const { billing, captured } = makeBilling({
      existing: existing(),
      rates: new Map([['7_100', 25]]),
    });
    await billing.saveNightEntriesBatch(
      {} as any,
      sheet() as any,
      1,
      [{ clientId: 7, productId: 10, orderedQty: 3 }],
      [],
    );
    expect(captured.upserts[0].night_selling_rate).toBe(18);
  });
});

describe('S-16 rate effective_from vs sale_date at 00:00 UTC', () => {
  const matches = (r: any, w: any): boolean => {
    for (const [k, v] of Object.entries(w)) {
      if (k === 'OR') {
        if (!(v as any[]).some((c) => matches(r, c))) return false;
        continue;
      }
      const x = r[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as any;
        if ('in' in o && !o.in.includes(x)) return false;
        if ('lte' in o && !(x <= o.lte)) return false;
        if ('gte' in o && !(x !== null && x >= o.gte)) return false;
      } else if (v === null ? x !== null : x !== v) return false;
    }
    return true;
  };
  const db = (rows: any[]) => ({
    master_client_rate_product: {
      findMany: async ({ where }: any) => rows.filter((r) => matches(r, where)),
    },
    distributor_product_rate: { findMany: async () => [] },
  });
  it('a rate created at 10:00 IST on the sale day applies to that sale day', async () => {
    const created = new Date('2026-10-09T04:30:00Z'); // 10:00 IST, effective_from default now()
    const rows = [
      {
        client_id: 7,
        product_link_id: 100,
        is_active: true,
        effective_from: created,
        effective_to: null,
        selling_rate: 22,
      },
    ];
    const out = await new OrdersRepository({} as any).getSellingRatesBatch(
      [{ clientId: 7, productLinkId: 100 }],
      new Date('2026-10-09T00:00:00Z'),
      db(rows) as any,
    );
    expect(out.get('7_100')).not.toBeNull();
  });
});
