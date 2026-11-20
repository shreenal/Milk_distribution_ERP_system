/**
 * Dairy Trays: access, throttling, request shape. Scenarios DY-01 to DY-16 (behavioral spec section C1, F4).
 * Run serially: npx vitest run src/modules/transactions/dairy-trays --no-file-parallelism
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import {
  DT_PAPER_NOT_FOUND,
  DT_RETURNS_REJECTED,
  STALE_DT,
  buyTrays,
  cleanupDtTests,
  dairyRows,
  dtApi,
  ledgerScene,
  re,
  rebuildLedger,
  setVehicleActive,
} from '../../../../test/helper/dairy-trays-helpers.js';

const MISSING = 2_000_000_000;
const text = (r: { body: unknown }) => JSON.stringify(r.body);

let ctx: OrdersCtx;
let dt: ReturnType<typeof dtApi>;
beforeAll(async () => {
  ctx = await createOrdersTestContext({ modules: [DairyTraysModule] });
  dt = dtApi(ctx);
});
afterAll(() => ctx.close());
afterEach(() => cleanupDtTests(ctx));

/** Four endpoints, each with a valid-looking request. */
const allEndpoints = (paperId: number, token: string | null) => [
  dt.get(paperId, token),
  dt.save(paperId, [], new Date().toISOString(), { token }),
  dt.reconcile(paperId, [], new Date().toISOString(), { token }),
  dt.recalc({ fromDate: '2098-01-01', toDate: '2098-01-02' }, { token }),
];

describe('DY-01 to DY-04 access', () => {
  it('DY-01 a: no JWT is 401 on all four endpoints', async () => {
    const s = await ledgerScene(ctx);
    for (const r of await Promise.all(allEndpoints(s.paperId, null)))
      expect(r.status).toBe(401);
  });

  it('DY-01 b: a garbage JWT is 401 on all four endpoints', async () => {
    const s = await ledgerScene(ctx);
    for (const r of await Promise.all(allEndpoints(s.paperId, 'not.a.jwt')))
      expect(r.status).toBe(401);
  });

  it('DY-01 c: an expired JWT is 401 on all four endpoints', async () => {
    const s = await ledgerScene(ctx);
    const expired = ctx.tokenFor(ctx.users.admin, { expiresIn: '-10s' });
    for (const r of await Promise.all(allEndpoints(s.paperId, expired)))
      expect(r.status).toBe(401);
  });

  it('DY-02: EMPLOYEE gets 200 on GET and save, 403 on reconcile and recalculate; ADMIN is allowed everywhere', async () => {
    const s = await ledgerScene(ctx);
    const token = (await s.token())!;

    expect((await dt.get(s.paperId)).status).toBe(200);
    // an empty entries array is 400 (DT-4.3), so a no-op entry is used
    const noop = [re(s.v, s.trayTypeId, 0)];
    expect((await dt.save(s.paperId, noop, token)).status).toBe(200);
    expect(
      (await dt.reconcile(s.paperId, noop, token, { token: ctx.tokens.emp }))
        .status,
    ).toBe(403);
    expect(
      (
        await dt.recalc(
          { fromDate: '2098-01-01', toDate: '2098-01-01' },
          { token: ctx.tokens.emp },
        )
      ).status,
    ).toBe(403);

    expect((await dt.get(s.paperId, ctx.tokens.admin)).status).toBe(200);
    expect(
      (await dt.save(s.paperId, noop, token, { token: ctx.tokens.admin }))
        .status,
    ).toBe(200);
    // reconcile accepts only inactive entities, so the vehicle is deactivated first
    await setVehicleActive(ctx, s.v, false);
    expect((await dt.reconcile(s.paperId, noop, token)).status).toBe(200);
    expect(
      (await dt.recalc({ fromDate: '2098-01-01', toDate: '2098-01-01' }))
        .status,
    ).toBe(200);
  });

  it('DY-03: a deactivated user with an unexpired token is 401', async () => {
    const s = await ledgerScene(ctx);
    const user = await ctx.world.addUser('EMPLOYEE', false);
    const token = ctx.tokenFor(user);
    for (const r of await Promise.all(allEndpoints(s.paperId, token)))
      expect(r.status).toBe(401);
  });
});

describe('DY-04 throttling (own app instance with the real throttle guard)', () => {
  let tctx: OrdersCtx;
  beforeAll(async () => {
    tctx = await createOrdersTestContext({
      throttle: true,
      modules: [DairyTraysModule],
    });
  });
  afterAll(() => tctx.close());

  it('DY-04: 11th save, 6th reconcile and 6th recalculate within 60 s are 429; another user is unaffected', async () => {
    const t = dtApi(tctx);
    const stale = new Date().toISOString();
    // Requests that fail validation still count against the limit.
    const badSave = (token: string) => t.save(MISSING, [], stale, { token });
    for (let i = 0; i < 10; i++)
      expect((await badSave(tctx.tokens.emp)).status).not.toBe(429);
    expect((await badSave(tctx.tokens.emp)).status).toBe(429);
    expect((await badSave(tctx.tokens.emp2)).status).not.toBe(429);

    for (let i = 0; i < 5; i++)
      expect(
        (await t.reconcile(MISSING, [], stale)).status,
        `reconcile ${i + 1}`,
      ).not.toBe(429);
    expect((await t.reconcile(MISSING, [], stale)).status).toBe(429);

    for (let i = 0; i < 5; i++)
      expect((await t.recalc({})).status).not.toBe(429);
    expect((await t.recalc({})).status).toBe(429);

    // GET uses the global limit (300 per minute), so it is not limited here.
    expect((await t.get(MISSING)).status).not.toBe(429);
  });
});

describe('DY-05 and DY-06 paperId', () => {
  it.each(['abc', '0', '-1', '2147483648'])(
    'DY-05 a: paperId %s is 400 Invalid id on GET, save and reconcile',
    async (bad) => {
      const stale = new Date().toISOString();
      const calls = [
        dt.get(bad),
        dt.save(bad, [], stale),
        dt.reconcile(bad, [], stale),
      ];
      for (const r of await Promise.all(calls)) {
        expect(r.status).toBe(400);
        expect(text(r)).toContain('Invalid id');
      }
    },
  );

  it('DY-05 b: a zero-padded id is read as the number', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.get(String(s.paperId).padStart(8, '0'));
    expect(r.status).toBe(200);
    expect(r.body.paper.id).toBe(s.paperId);
  });

  it('DY-06 a: a missing paper is 404 "Order paper not found" on GET, save and reconcile', async () => {
    expect(DT_PAPER_NOT_FOUND).toBe('Order paper not found');
    const stale = new Date().toISOString();
    const body = [re({ id: 1 }, 1, 0)];
    for (const r of [
      await dt.get(MISSING),
      await dt.save(MISSING, body, stale),
      await dt.reconcile(MISSING, body, stale),
    ]) {
      expect(r.status).toBe(404);
      expect(text(r)).toContain(DT_PAPER_NOT_FOUND);
    }
  });

  it('DY-06 b: an invalid body for a missing paper is 400 (shape first)', async () => {
    const stale = new Date().toISOString();
    expect((await dt.save(MISSING, 'nope', stale)).status).toBe(400);
    expect((await dt.reconcile(MISSING, undefined, stale)).status).toBe(400);
  });
});

describe('DY-07 success status', () => {
  it('DY-07: save, reconcile and recalculate answer 200', async () => {
    const s = await ledgerScene(ctx);
    const token = (await s.token())!;
    const noop = [re(s.v, s.trayTypeId, 0)];
    expect((await dt.save(s.paperId, noop, token)).status).toBe(200);
    await setVehicleActive(ctx, s.v, false);
    expect((await dt.reconcile(s.paperId, noop, token)).status).toBe(200);
    expect(
      (await dt.recalc({ fromDate: '2098-01-01', toDate: '2098-01-01' }))
        .status,
    ).toBe(200);
  });
});

describe('DY-08 and DY-09 unknown fields', () => {
  it('DY-08 a: unknown top-level and entry fields are stripped on save and the request proceeds', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(
      s.paperId,
      [{ ...re(s.v, s.trayTypeId, 3), bogus: 'x' }],
      (await s.token())!,
      { extra: { foo: 1 } },
    );
    expect(r.status, text(r)).toBe(200);
    expect((await dairyRows(ctx, s.paperId))[0].trays_returned).toBe(3);
  });

  it('DY-08 b: unknown fields are stripped on reconcile too', async () => {
    const s = await ledgerScene(ctx);
    await setVehicleActive(ctx, s.v, false);
    const r = await dt.reconcile(
      s.paperId,
      [{ ...re(s.v, s.trayTypeId, 2), bogus: 'x' }],
      (await s.token())!,
      { extra: { foo: 1 } },
    );
    expect(r.status, text(r)).toBe(200);
  });

  it('DY-09: an unknown field on the range recalculation is 400 (not stripped)', async () => {
    const r = await dt.recalc({
      fromDate: '2098-01-01',
      toDate: '2098-01-02',
      foo: 1,
    });
    expect(r.status).toBe(400);
  });
});

describe('DY-10 to DY-14 body shape', () => {
  const nothingSaved = async (
    s: Awaited<ReturnType<typeof ledgerScene>>,
    tokenBefore: string | null,
  ) => {
    expect(await s.token()).toBe(tokenBefore);
    expect((await dairyRows(ctx, s.paperId))[0].trays_returned).toBe(0);
  };

  it.each([
    ['12.5', 12.5],
    ['-1', -1],
    ['string "40"', '40'],
    ['null', null],
    ['blank', ''],
    ['2001', 2001],
  ])('DY-10 a: returned %s is 400 and nothing is saved', async (_n, bad) => {
    const s = await ledgerScene(ctx, { qty: 2001 });
    const before = await s.token();
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, bad)], before);
    expect(r.status, text(r)).toBe(400);
    await nothingSaved(s, before);
  });

  it('DY-10 b: an omitted returned is 400 and nothing is saved', async () => {
    const s = await ledgerScene(ctx);
    const before = await s.token();
    const { returned: _omit, ...entry } = re(s.v, s.trayTypeId, 1);
    const r = await dt.save(s.paperId, [entry], before);
    expect(r.status, text(r)).toBe(400);
    await nothingSaved(s, before);
  });

  it('DY-11: returned 0, 1 and 2000 are accepted by shape', async () => {
    const s = await ledgerScene(ctx, { qty: 2000 });
    let token = (await s.token())!;
    for (const value of [0, 1, 2000]) {
      const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, value)], token);
      expect(r.status, `returned ${value}: ${text(r)}`).toBe(200);
      token = r.body.dairyTraysUpdatedAt;
    }
    expect((await dairyRows(ctx, s.paperId))[0].trays_returned).toBe(2000);
  });

  it.each([
    ['vehicleId 0', { vehicleId: 0 }],
    ['vehicleId 1.5', { vehicleId: 1.5 }],
    ['vehicleId 2147483648', { vehicleId: 2147483648 }],
    ['trayTypeId 0', { trayTypeId: 0 }],
    ['trayTypeId 1.5', { trayTypeId: 1.5 }],
    ['trayTypeId 2147483648', { trayTypeId: 2147483648 }],
    ['session FOO', { deliverySession: 'FOO' }],
    ['session night', { deliverySession: 'night' }],
  ])('DY-12: %s is 400', async (_n, patch) => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(
      s.paperId,
      [{ ...re(s.v, s.trayTypeId, 1), ...patch }],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(400);
  });

  it.each([
    ['missing', undefined],
    ['empty', []],
  ])('DY-13 a: entries %s is 400', async (_n, entries) => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(s.paperId, entries, (await s.token())!);
    expect(r.status).toBe(400);
  });

  it('DY-13 b: 5001 entries is 400; 5000 and 1 pass the shape check', async () => {
    const s = await ledgerScene(ctx);
    const token = (await s.token())!;
    const many = (n: number) =>
      Array.from({ length: n }, (_v, i) => ({
        vehicleId: i + 1,
        trayTypeId: s.trayTypeId,
        deliverySession: 'NIGHT',
        returned: 0,
      }));

    const over = await dt.save(s.paperId, many(5001), token);
    expect(over.status).toBe(400);
    expect(text(over)).not.toContain(DT_RETURNS_REJECTED);

    // Unknown rows are a business 400 ("returns were rejected"), which proves the shape check was passed.
    const max = await dt.save(s.paperId, many(5000), token);
    expect(max.status).toBe(400);
    expect(text(max)).toContain(DT_RETURNS_REJECTED);

    const one = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 1)], token);
    expect(one.status, text(one)).toBe(200);
  });

  it('DY-14 a: the same vehicle + session + tray type twice is 400 naming the first duplicate', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 1), re(s.v, s.trayTypeId, 2)],
      (await s.token())!,
    );
    expect(r.status).toBe(400);
    expect(text(r)).toContain(
      `Duplicate entry for vehicle ${s.v.id}, tray type ${s.trayTypeId}, NIGHT`,
    );
  });

  it('DY-14 b: the same vehicle + tray type in NIGHT and MORNING is valid', async () => {
    const s = await ledgerScene(ctx);
    await buyTrays(ctx, s.sheet, s.v, s.p, s.dist, 5, { session: 'MORNING' });
    await rebuildLedger(ctx, s.paperId);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 1, 'NIGHT'), re(s.v, s.trayTypeId, 2, 'MORNING')],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    expect(
      (await dairyRows(ctx, s.paperId)).map((x) => x.trays_returned).sort(),
    ).toEqual([1, 2]);
  });
});

describe('DY-15 expectedUpdatedAt', () => {
  it('DY-15 a: omitted is 400', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 1)], undefined);
    expect(r.status, text(r)).toBe(400);
  });

  it('DY-15 b: null is 409 stale', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 1)], null);
    expect(r.status).toBe(409);
    expect(text(r)).toContain(STALE_DT);
  });

  it('DY-15 c: an unparseable value is 400 "Invalid expectedUpdatedAt"', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 1)], 'abc');
    expect(r.status).toBe(400);
    expect(text(r)).toContain('Invalid expectedUpdatedAt');
  });

  it('DY-15 d: a well-formed but different (date-only) value is 409', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 1)],
      '2000-01-01',
    );
    expect(r.status).toBe(409);
    expect(text(r)).toContain(STALE_DT);
  });
});

describe('DY-16 range recalculation shape', () => {
  it('DY-16 a: bad shape is 400 with the DTO text', async () => {
    for (const body of [
      {},
      { fromDate: '2098-1-1', toDate: '2098-01-02' },
      { fromDate: '2098-01-01', toDate: 'x' },
    ]) {
      const r = await dt.recalc(body);
      expect(r.status).toBe(400);
    }
    const r = await dt.recalc({ fromDate: '2098-1-1', toDate: '2098-01-02' });
    expect(text(r)).toContain('fromDate must be in YYYY-MM-DD format');
  });

  it('DY-16 b: an impossible date is 400 "must be valid YYYY-MM-DD dates"', async () => {
    const r = await dt.recalc({ fromDate: '2026-02-31', toDate: '2026-03-01' });
    expect(r.status).toBe(400);
    expect(text(r)).toContain(
      'fromDate and toDate must be valid YYYY-MM-DD dates',
    );
  });

  it('DY-16 c: from after to is 400 "must not be after"', async () => {
    const r = await dt.recalc({ fromDate: '2098-01-05', toDate: '2098-01-04' });
    expect(r.status).toBe(400);
    expect(text(r)).toContain('fromDate must not be after toDate');
  });

  it('DY-16 d: 32 days is 400, 31 days and 1 day are accepted', async () => {
    const tooLong = await dt.recalc({
      fromDate: '2098-01-01',
      toDate: '2098-02-01',
    });
    expect(tooLong.status).toBe(400);
    expect(text(tooLong)).toContain('The date range cannot exceed 31 days');

    expect(
      (await dt.recalc({ fromDate: '2098-01-01', toDate: '2098-01-31' }))
        .status,
    ).toBe(200);
    expect(
      (await dt.recalc({ fromDate: '2098-01-01', toDate: '2098-01-01' }))
        .status,
    ).toBe(200);
  });
});
