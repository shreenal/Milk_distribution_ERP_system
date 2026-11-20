/**
 * Client Trays – access, throttling, ids, success status.
 * Scenarios: T-01 .. T-09   (spec: CT-1.1 .. 1.4, CT-3.2, CT-5.3, CT-13)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  cleanupTrayTests,
  ret,
  setTrayActive,
  submittedWithTrays,
  traysApi,
  trayToken,
  tt,
} from '../../../../test/helper/client-trays-helpers.js';

const MISSING = 2000000000;

describe('Client Trays access & request shape', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = traysApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  it('T-01 no / garbage / expired JWT → 401 on view, save, reconcile, recalculate; nothing changes', async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    const base = `/client-trays/sheet/${s.sheet.sheetId}`;
    const body = { entries: [ret(c.id, tt(ctx), 1)], expectedUpdatedAt: null };
    const expired = ctx.tokenFor(ctx.users.emp, { expiresIn: '-10s' });
    const calls: Record<
      string,
      (t?: string) => PromiseLike<{ status: number }>
    > = {
      view: (t) => ctx.call('get', base, t),
      save: (t) => ctx.call('post', `${base}/save`, t, body),
      reconcile: (t) => ctx.call('post', `${base}/reconcile-inactive`, t, body),
      recalculate: (t) =>
        ctx.call('post', '/client-trays/recalculate', t, {
          fromDate: '2000-01-01',
          toDate: '2000-01-02',
        }),
    };
    for (const [name, fn] of Object.entries(calls)) {
      for (const tok of [undefined, 'garbage', expired]) {
        const res = await fn(tok);
        expect(
          res.status,
          `${name} with token ${String(tok).slice(0, 8)}`,
        ).toBe(401);
      }
    }
    expect(
      (await ctx.trayRows(s.sheet.sheetId)).every(
        (r) => r.trays_returned === 0,
      ),
    ).toBe(true);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
  });

  it('T-02 valid EMPLOYEE and ADMIN JWT: view and save are allowed', async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    for (const t of [ctx.tokens.emp, ctx.tokens.admin]) {
      expect((await api.get(s.sheet.sheetId, t)).status).toBe(200);
    }
    const first = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 1)],
      null,
      ctx.tokens.emp,
    );
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const second = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 2)],
      first.body.clientTraysUpdatedAt,
      ctx.tokens.admin,
    );
    expect(second.status, JSON.stringify(second.body)).toBe(200);
  });

  it('T-03 EMPLOYEE calls reconcile-inactive or recalculate → 403, nothing changes', async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    const rec = await api.reconcile(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 1)],
      null,
      ctx.tokens.emp,
    );
    expect(rec.status).toBe(403);
    const range = await api.recalc('2000-01-01', '2000-01-02', ctx.tokens.emp);
    expect(range.status).toBe(403);
    expect(
      (await ctx.trayRows(s.sheet.sheetId)).every(
        (r) => r.trays_returned === 0,
      ),
    ).toBe(true);
  });

  it('T-04 deactivated user with an unexpired token → 401', async () => {
    const s = await submittedWithTrays(ctx);
    const inactive = await ctx.world.addUser('EMPLOYEE', false);
    expect(
      (await api.get(s.sheet.sheetId, ctx.tokenFor(inactive))).status,
    ).toBe(401);
  });

  it('T-05 11th save in 60 s → 429; 6th reconcile / recalculate → 429; another user unaffected', async () => {
    const t = await createOrdersTestContext({ throttle: true });
    try {
      const tapi = traysApi(t);
      const s = await submittedWithTrays(t);
      const [c] = s.clients;
      // returned 0 equals the stored ledger: a no-op save, so every call is a clean 200 and still counts.
      const noop = (tok: string) =>
        tapi.save(s.sheet.sheetId, [ret(c.id, tt(t), 0)], null, tok);
      for (let i = 1; i <= 10; i++)
        expect((await noop(t.tokens.emp)).status, `save ${i}`).toBe(200);
      expect((await noop(t.tokens.emp)).status).toBe(429);
      expect((await noop(t.tokens.admin)).status).toBe(200);

      for (let i = 1; i <= 5; i++)
        expect(
          (await tapi.recalc('2000-01-01', '2000-01-02')).status,
          `recalc ${i}`,
        ).toBe(200);
      expect((await tapi.recalc('2000-01-01', '2000-01-02')).status).toBe(429);

      const rec = () =>
        tapi.reconcile(s.sheet.sheetId, [ret(c.id, tt(t), 0)], null);
      for (let i = 1; i <= 5; i++)
        expect((await rec()).status, `reconcile ${i}`).not.toBe(429);
      expect((await rec()).status).toBe(429);
    } finally {
      await cleanupTrayTests(t);
      await t.close();
    }
  }, 60000);

  it("T-06 any employee (or admin) can save another group's sheet (CT-1.4, no per-group scoping)", async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    const res = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 1)],
      null,
      ctx.tokens.emp2,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await ctx.trayRows(s.sheet.sheetId))[0].trays_returned).toBe(1);
  });

  it('T-07 sheet id abc / 0 / -1 / 2147483648 → 400 "Invalid id"; 007-style accepted', async () => {
    const s = await submittedWithTrays(ctx);
    for (const bad of ['abc', '0', '-1', '2147483648']) {
      const v = await api.get(bad);
      expect(v.status, `view ${bad}`).toBe(400);
      expect(v.body.message).toBe('Invalid id');
      const w = await api.save(bad, [ret(1, 1, 0)], null);
      expect(w.status, `save ${bad}`).toBe(400);
      expect(w.body.message).toBe('Invalid id');
    }
    expect((await api.get(`000${s.sheet.sheetId}`)).status).toBe(200);
  });

  it('T-08 missing sheet → 404 "Sheet not found" on view, save, reconcile', async () => {
    const entries = [ret(1, 1, 0)];
    const results = {
      view: await api.get(MISSING),
      save: await api.save(MISSING, entries, null),
      reconcile: await api.reconcile(MISSING, entries, null),
    };
    for (const [k, r] of Object.entries(results)) {
      expect(r.status, k).toBe(404);
      expect(r.body.message, k).toBe('Sheet not found');
    }
  });

  it('T-09 successful save, reconcile and recalculate answer 200 (not 201)', async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    const save = await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null);
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    await setTrayActive(ctx, tt(ctx), false);
    const rec = await api.reconcile(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 1)],
      save.body.clientTraysUpdatedAt,
    );
    expect(rec.status, JSON.stringify(rec.body)).toBe(200);
    expect((await api.recalc('2000-01-01', '2000-01-02')).status).toBe(200);
  });
});
