import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ConflictException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { withSerializableRetry } from '../src/common/prisma/with-serializable-retry.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { ClientTraysValidationService } from '../src/modules/transactions/client-trays/services/client-trays-validation.service.js';
import { DairyTraysValidationService } from '../src/modules/transactions/dairy-trays/services/dairy-trays-validation.service.js';
import { WorkflowStateService } from '../src/modules/transactions/workflow/workflow-state.service.js';
import { FinalBillingService } from '../src/modules/transactions/orders/services/final-billing.service.js';
import { Decimal } from '../src/common/utils/money.util.js';
import {
  realRepo,
  upsertRow,
  makeBilling,
  sheet,
  newPg,
  pgDb,
} from './helper.js';

const SRC = path.resolve('src');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

describe('N-01 client-tray gate blocks night submit for sheets with no tray-based product', () => {
  it('validateTrayCalculationExists must not fail when no tray rows are applicable', async () => {
    const v = new ClientTraysValidationService({
      getTrayTransactions: async () => [],
    } as any);
    await expect(
      v.validateTrayCalculationExists(1, {} as any),
    ).resolves.toBeUndefined();
  });
});

describe('N-01b root cause: propagation writes no tray rows for non-tray sheets', () => {
  it('recalculateFromSheet persists nothing when no item resolves a tray type', async () => {
    const { ClientTraysPropagationService } =
      await import('../src/modules/transactions/client-trays/services/client-trays-propagation.service.js');
    const { TrayCalculationService } =
      await import('../src/common/calculators/tray-calculation.service.js');
    const replace = vi.fn();
    const repo: any = {
      findSheetById: async () => ({
        id: 1,
        group_id: 5,
        order_morning_entry_saved_at: null,
        order_paper: { status: 'DRAFT', sale_date: new Date() },
      }),
      getSheetItems: async () => [
        {
          client_id: 7,
          tray_type_id: null,
          ordered_qty: 5,
          delivered_qty: null,
          master_product: {
            brand_id: 1,
            product_group_id: 2,
            product_type_id: null,
            packaging_type_id: null,
          },
        },
      ],
      getProductTrayRules: async () => [],
      getTrayTransactions: async () => [],
      getPreviousSheet: async () => null,
      replaceTrayTransactions: replace,
    };
    await new ClientTraysPropagationService(
      repo,
      new TrayCalculationService({} as any),
      new WorkflowStateService(),
    ).recalculateFromSheet(1, {} as any);
    expect(replace).not.toHaveBeenCalled(); // => validateTrayCalculationExists (N-01) will then throw at night submit
  });
});

describe('N-02 withSerializableRetry mechanics', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('retries P2034 and meta.code 40001, then succeeds', async () => {
    let n = 0;
    const p = withSerializableRetry(async () => {
      n++;
      if (n === 1) throw { code: 'P2034' };
      if (n === 2) throw { code: 'P2010', meta: { code: '40001' } };
      return 'ok';
    });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(n).toBe(3);
  });
  it('exhaustion -> 409; other errors are rethrown untouched', async () => {
    const p = withSerializableRetry(async () => {
      throw { code: 'P2034' };
    });
    p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(
      withSerializableRetry(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});

describe('N-03 REDIS_TLS env parsing / health probe', () => {
  it('REDIS_TLS="false" must not enable TLS in the validated config the app actually reads', async () => {
    const { envValidationSchema } =
      await import('../src/config/env.validation.js');
    const { value } = envValidationSchema.validate(
      {
        DATABASE_URL: 'postgres://u:p@h/db',
        SECRET: 's',
        CORS_ORIGINS: 'x',
        REDIS_TLS: 'false',
      },
      { allowUnknown: true },
    );
    console.log(
      'N-03 validated REDIS_TLS =',
      JSON.stringify(value.REDIS_TLS),
      typeof value.REDIS_TLS,
    );
    expect(Boolean(value.REDIS_TLS)).toBe(false);
  });
  it('readiness Redis probe honours password/TLS like the real client', () => {
    const h = read('../src/health/health.controller.ts');
    const probe = h.slice(h.indexOf('private async checkRedis'));
    expect(probe).toMatch(/REDIS_PASSWORD/);
  });
  it('REDIS_PASSWORD / REDIS_TLS are declared in env validation', () => {
    expect(read('../src/config/env.validation.ts')).toMatch(/REDIS_PASSWORD/);
  });
});

describe('N-04 reopened: lines with delivered=0 are re-priced with LIVE rate/GST', () => {
  it('keeps frozen final rate for a delivered=0 line', async () => {
    const existing = new Map([
      [
        '7_10',
        {
          product_link_id: 100,
          units_per_order_unit: 1,
          pricing_quantity: 1,
          pricing_unit: 'L',
          delivered_qty: 0,
          final_selling_rate: 20,
          final_gst_percentage: 5,
          final_gst_inclusive: false,
          master_product: { gst_percentage: 18, is_gst_inclusive: false },
        },
      ],
    ]);
    const { billing, captured } = makeBilling({
      existing,
      rates: new Map([['7_100', 30]]),
    });
    await billing.saveMorningEntriesBatch(
      {} as any,
      sheet('REOPENED') as any,
      1,
      [{ clientId: 7, productId: 10, deliveredQty: 4 }],
    );
    expect(captured.updates[0].final_selling_rate).toBe(20);
  });
});

describe('N-05 SQL injection (refuted)', () => {
  it('hostile strings only ever travel as bind values', async () => {
    let q: any;
    const evil = '1); DROP TABLE order_sheet_items;--';
    await realRepo().upsertSheetEntriesBatch(
      [upsertRow({ client_id: evil as any })],
      {
        $executeRaw: async (x: any) => {
          q = x;
        },
      } as any,
    );
    expect(q.text).not.toContain('DROP');
    expect(q.values).toContain(evil);
  });
});

describe('N-06 every Orders route is role-guarded', () => {
  it('each HTTP handler has @Roles', () => {
    const c = read('../src/modules/transactions/orders/orders.controller.ts');
    const routes = (c.match(/@(Get|Post|Delete|Put|Patch)\(/g) ?? []).length,
      roles = (c.match(/@Roles\(/g) ?? []).length;
    expect(roles).toBe(routes);
    expect(c).toMatch(/UseGuards\(JwtAuthGuard, RolesGuard\)/);
  });
});

describe('N-07 exception filter does not leak internals (refuted)', () => {
  it('Prisma-style error becomes a generic 500', () => {
    let status = 0,
      body: any;
    const res: any = {
      status: (s: number) => {
        status = s;
        return {
          json: (b: any) => {
            body = b;
          },
        };
      },
    };
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'POST', url: '/x', requestId: 'r1' }),
      }),
    };
    vi.spyOn(
      (AllExceptionsFilter.prototype as any).logger ?? console,
      'error',
    ).mockImplementation(() => {});
    new AllExceptionsFilter().catch(
      Object.assign(
        new Error('relation "order_sheet_items" ... SELECT secret'),
        { code: 'P2010' },
      ),
      host,
    );
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/order_sheet_items|SELECT/);
    expect(body.requestId).toBe('r1');
  });
});

describe('N-08 key parsing: grep split("_")', () => {
  it('dairy-tray completeness error reports real vehicle & tray ids', async () => {
    const v = new DairyTraysValidationService(
      {
        findDairyTrayPaperByOrderPaperId: async () => ({ id: 1 }),
        getCurrentTrayTransactions: async () => [],
        getPurchaseEntries: async () => [
          {
            vehicle_id: 4,
            delivery_session: 'NIGHT',
            tray_type_id: 9,
            master_product: {},
          },
        ],
        getProductTrayRules: async () => [],
      } as any,
      { resolveFrozenTrayTypeId: (e: any) => e.tray_type_id } as any,
    );
    await expect(v.validateDairyTraysComplete(1, {} as any)).rejects.toThrow(
      /vehicle 4 and tray type 9/,
    );
  });
  it('list of remaining split("_") call sites', () => {
    const hits = fs
      .readdirSync(SRC)
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) =>
        read(f)
          .split('\n')
          .map((l, i) => ({ f, i: i + 1, l }))
          .filter((x) => /\.split\('_'\)/.test(x.l))
          .map((x) => `${x.f}:${x.i}`),
      );
    console.log('N-08 split("_") sites:', hits);
    expect(hits).toEqual([]);
  });
});

describe('Section 5 workflow matrix (status x operation)', () => {
  const ws = new WorkflowStateService();
  const S = [
    'DRAFT',
    'NIGHT_SUBMITTED',
    'MORNING_SUBMITTED',
    'FINALIZED',
    'REOPENED',
  ] as const;
  const expected: Record<string, boolean[]> = {
    // [nightSave, morningSave] per status
    DRAFT: [true, false],
    NIGHT_SUBMITTED: [false, true],
    MORNING_SUBMITTED: [false, false],
    FINALIZED: [false, false],
    REOPENED: [false, true],
  };
  it('matches the documented business invariant', () => {
    const got: any = {};
    for (const s of S)
      got[s] = [
        ws.canEditNightEntries(s as any),
        ws.canEditMorningEntries(s as any),
      ];
    console.table(got);
    expect(got).toEqual(expected);
  });
  it('legal transitions only', () => {
    expect(() =>
      ws.validateTransition('DRAFT' as any, 'FINALIZED' as any),
    ).toThrow(BadRequestException);
    expect(() =>
      ws.validateTransition('FINALIZED' as any, 'REOPENED' as any),
    ).not.toThrow();
  });
});

describe('Section 7 billing fixtures', () => {
  const f = new FinalBillingService();
  it.each([
    [10, 20, 5, true, 1, 200, 190.48, 9.52],
    [10, 20, 5, false, 1, 210, 200, 10],
    [0, 20, 12, false, 1, 0, 0, 0],
    [3, 33.33, 18, false, 1, 117.99, 99.99, 18],
    [2.5, 47, 5, true, 0.5, 58.75, 55.95, 2.8],
  ])(
    'qty %s rate %s gst %s%% incl=%s pq=%s',
    (q, r, g, inc, pq, fin, tax, gst) => {
      const x = f.calculate(
        q as number,
        r as number,
        g as number,
        inc as boolean,
        pq as number,
      );
      expect(x).toEqual({
        finalBillAmount: fin,
        taxableAmount: tax,
        gstAmount: gst,
      });
    },
  );
  it('invariant over 5000 random lines: taxable + gst == final and final matches independent Decimal calc', () => {
    for (let i = 0; i < 5000; i++) {
      const q = Math.round(Math.random() * 1e4) / 100,
        r = Math.round(Math.random() * 1e4) / 100,
        g = [0, 5, 12, 18, 28][i % 5],
        inc = i % 2 === 0,
        pq = [1, 0.5, 0.25, 1.5][i % 4];
      const x = f.calculate(q, r, g, inc, pq);
      expect(
        Math.abs(x.taxableAmount + x.gstAmount - x.finalBillAmount),
      ).toBeLessThan(0.005);
      const base = new Decimal(q).times(pq).times(r);
      const exp = (
        inc ? base : base.times(new Decimal(1).plus(new Decimal(g).div(100)))
      )
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
      expect(x.finalBillAmount).toBe(exp);
    }
  });
});

describe('PROOFS that the proposed fixes work on real Postgres', () => {
  it('S-05 fix: explicit casts in VALUES make the morning UPDATE succeed', async () => {
    const pg = await newPg();
    await realRepo().upsertSheetEntriesBatch([upsertRow()], pgDb(pg) as any);
    await pg.query(
      `UPDATE order_sheet_items osi SET delivered_qty=v.d, final_bill_amount=v.b, updated_at=(now() AT TIME ZONE 'UTC')
      FROM (VALUES ($1::int,$2::int,$3::int,$4::numeric,$5::numeric)) AS v(s,c,l,d,b)
      WHERE osi.order_sheet_id=v.s AND osi.client_id=v.c AND osi.product_link_id=v.l`,
      [1, 7, 100, 4.5, 90],
    );
    expect(
      Number(
        (
          (await pg.query('select delivered_qty from order_sheet_items'))
            .rows[0] as any
        ).delivered_qty,
      ),
    ).toBe(4.5);
  });
  it('S-04 fix: 1000-row chunks (19k params) succeed; 5000 rows in 5 chunks', async () => {
    const pg = await newPg();
    const repo = realRepo();
    const rows = Array.from({ length: 5000 }, (_, i) =>
      upsertRow({ client_id: i + 1 }),
    );
    for (let i = 0; i < rows.length; i += 1000)
      await repo.upsertSheetEntriesBatch(
        rows.slice(i, i + 1000),
        pgDb(pg) as any,
      );
    expect(
      Number(
        (
          (await pg.query('select count(*)::int as c from order_sheet_items'))
            .rows[0] as any
        )?.c,
      ),
    ).toBe(5000);
  }, 120000);
  it('S-03 fix: on conflict, delivered/final are reset when ordered_qty goes 0 -> >0', async () => {
    const pg = await newPg();
    const repo = realRepo();
    await repo.upsertSheetEntriesBatch(
      [upsertRow({ ordered_qty: 0, delivered_qty: 0, final_bill_amount: 0 })],
      pgDb(pg) as any,
    );
    await pg.query(`UPDATE order_sheet_items SET delivered_qty = CASE WHEN ordered_qty = 0 THEN NULL ELSE delivered_qty END,
                    final_bill_amount = CASE WHEN ordered_qty = 0 THEN NULL ELSE final_bill_amount END, ordered_qty = 5`);
    expect(
      (
        (await pg.query('select delivered_qty from order_sheet_items'))
          .rows[0] as any
      ).delivered_qty,
    ).toBeNull();
  });
  it('S-07: ON CONFLICT ON CONSTRAINT cannot cover two arbiters; catching 23505 -> 409 is the practical fix', async () => {
    const pg = await newPg();
    const repo = realRepo();
    await repo.upsertSheetEntriesBatch([upsertRow()], pgDb(pg) as any);
    const e: any = await repo
      .upsertSheetEntriesBatch(
        [upsertRow({ product_link_id: 101 })],
        pgDb(pg) as any,
      )
      .catch((x) => x);
    expect(e.code).toBe('23505');
  });
});
