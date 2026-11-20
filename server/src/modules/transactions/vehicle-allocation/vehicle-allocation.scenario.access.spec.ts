/**
 * Vehicle Allocation – access, throttling, ids, request shape, success status.
 * Scenarios: V-01 .. V-10   (spec: VA-1.1 .. 1.3, VA-3.1, VA-4.2, VA-4.3, VA-4.6, VA-10, VA-4.7)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addVehicle,
  al,
  cleanupVaTests,
  demandScene,
  vaApi,
  vaPaper,
  vaRows,
  vaToken,
} from '../../../../test/helper/vehicle-allocation-helpers.js';

const MISSING = 2000000000;

describe('Vehicle Allocation access & request shape', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = vaApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);

  it('V-01 no / garbage / expired JWT → 401 on view, save, reconcile; nothing changes', async () => {
    const s = await demandScene(ctx);
    const v = await addVehicle(ctx);
    const base = `/vehicle-allocations/${s.paperId}/vehicle-allocations`;
    const expired = ctx.tokenFor(ctx.users.emp, { expiresIn: '-10s' });
    const saveBody = {
      allocations: [al(v, s.dist, s.p, 1)],
      session: 'NIGHT',
      expectedUpdatedAt: null,
    };
    const calls: Record<
      string,
      (t?: string) => PromiseLike<{ status: number }>
    > = {
      view: (t) => ctx.call('get', `${base}?session=NIGHT`, t),
      save: (t) => ctx.call('post', base, t, saveBody),
      reconcile: (t) =>
        ctx.call('post', `${base}/reconcile`, t, {
          session: 'NIGHT',
          expectedUpdatedAt: null,
        }),
    };
    for (const [name, fn] of Object.entries(calls)) {
      for (const tok of [undefined, 'garbage', expired]) {
        expect(
          (await fn(tok)).status,
          `${name} with token ${String(tok).slice(0, 8)}`,
        ).toBe(401);
      }
    }
    expect(await vaPaper(ctx, s.paperId)).toBeNull();
    expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
  });

  it('V-02 EMPLOYEE and ADMIN are allowed and get exactly the same rules (no admin bypass)', async () => {
    const s = await demandScene(ctx);
    const v = await addVehicle(ctx);
    for (const t of [ctx.tokens.emp, ctx.tokens.admin])
      expect((await api.get(s.paperId, 'NIGHT', t)).status).toBe(200);
    const first = await api.save(s.paperId, [al(v, s.dist, s.p, 2)], null, {
      token: ctx.tokens.emp,
    });
    expect(first.status, body(first)).toBe(200);
    const second = await api.save(
      s.paperId,
      [al(v, s.dist, s.p, 3)],
      await vaToken(ctx, s.paperId),
      {
        token: ctx.tokens.admin,
      },
    );
    expect(second.status, body(second)).toBe(200);
    // the status rule applies to the admin as well (VA-1.2)
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    const locked = await api.save(
      s.paperId,
      [al(v, s.dist, s.p, 4)],
      await vaToken(ctx, s.paperId),
      {
        token: ctx.tokens.admin,
      },
    );
    expect(locked.status).toBe(400);
    const lockedReconcile = await api.reconcile(
      s.paperId,
      await vaToken(ctx, s.paperId),
      { token: ctx.tokens.admin },
    );
    expect(lockedReconcile.status).toBe(400);
  });

  it('V-03 deactivated user with an unexpired token → 401', async () => {
    const s = await demandScene(ctx);
    const inactive = await ctx.world.addUser('EMPLOYEE', false);
    expect(
      (await api.get(s.paperId, 'NIGHT', ctx.tokenFor(inactive))).status,
    ).toBe(401);
  });

  it('V-04 11th save in 60 s → 429; 11th reconcile → 429 (own counter); another user unaffected', async () => {
    const t = await createOrdersTestContext({ throttle: true });
    try {
      const tapi = vaApi(t);
      const s = await demandScene(t);
      // empty snapshot with nothing stored / reconcile with no allocation paper: clean no-op 200s that still count
      const save = (tok: string) =>
        tapi.save(s.paperId, [], null, { token: tok });
      const rec = (tok: string) =>
        tapi.reconcile(s.paperId, null, { token: tok });
      for (let i = 1; i <= 10; i++)
        expect((await save(t.tokens.emp)).status, `save ${i}`).toBe(200);
      expect((await save(t.tokens.emp)).status).toBe(429);
      expect((await save(t.tokens.admin)).status).toBe(200);
      for (let i = 1; i <= 10; i++)
        expect((await rec(t.tokens.emp)).status, `reconcile ${i}`).toBe(200);
      expect((await rec(t.tokens.emp)).status).toBe(429);
      expect((await rec(t.tokens.admin)).status).toBe(200);
    } finally {
      await cleanupVaTests(t);
      await t.close();
    }
  }, 60000);

  it('V-05 paperId abc / 0 / -1 / 2147483648 → 400 "Invalid id" on all endpoints; 007-style is accepted', async () => {
    const s = await demandScene(ctx);
    const v = await addVehicle(ctx);
    for (const bad of ['abc', '0', '-1', '2147483648']) {
      const g = await api.get(bad);
      expect(g.status, `view ${bad}`).toBe(400);
      expect(g.body.message).toBe('Invalid id');
      const w = await api.save(bad, [al(v, s.dist, s.p, 1)], null);
      expect(w.status, `save ${bad}`).toBe(400);
      expect(w.body.message).toBe('Invalid id');
      const r = await api.reconcile(bad, null);
      expect(r.status, `reconcile ${bad}`).toBe(400);
      expect(r.body.message).toBe('Invalid id');
    }
    expect((await api.get(`000${s.paperId}`)).status).toBe(200);
  });

  it('V-06 missing paper → 404 "Order paper not found" on view, save, reconcile', async () => {
    const r = {
      view: await api.get(MISSING),
      save: await api.save(
        MISSING,
        [al({ id: 1 }, { id: 1 }, { id: 1 }, 1)],
        null,
      ),
      reconcile: await api.reconcile(MISSING, null),
    };
    for (const [k, res] of Object.entries(r)) {
      expect(res.status, k).toBe(404);
      expect(res.body.message, k).toBe('Order paper not found');
    }
  });

  it('V-07 session missing / not NIGHT|MORNING → 400 on view (query) and on save / reconcile (body)', async () => {
    const s = await demandScene(ctx);
    for (const session of [null, 'FOO', 'night']) {
      expect(
        (await api.get(s.paperId, session)).status,
        `view ${session}`,
      ).toBe(400);
      expect(
        (await api.save(s.paperId, [], null, { session })).status,
        `save ${session}`,
      ).toBe(400);
      expect(
        (await api.reconcile(s.paperId, null, { session })).status,
        `reconcile ${session}`,
      ).toBe(400);
    }
  });

  it('V-08 unknown extra field (top level or inside an allocation) → 400; nothing saved', async () => {
    const s = await demandScene(ctx);
    const v = await addVehicle(ctx);
    const top = await api.save(s.paperId, [al(v, s.dist, s.p, 1)], null, {
      extra: { junk: 1 },
    });
    expect(top.status).toBe(400);
    const inner = await api.save(
      s.paperId,
      [{ ...al(v, s.dist, s.p, 1), rate: 5 }],
      null,
    );
    expect(inner.status).toBe(400);
    const rec = await api.reconcile(s.paperId, null, { extra: { junk: 1 } });
    expect(rec.status).toBe(400);
    expect(await vaPaper(ctx, s.paperId)).toBeNull();
  });

  it('V-09 successful save and reconcile, including ones that change nothing, answer 200 (not 201)', async () => {
    const s = await demandScene(ctx);
    const v = await addVehicle(ctx);
    const changed = await api.save(s.paperId, [al(v, s.dist, s.p, 2)], null);
    expect(changed.status, body(changed)).toBe(200);
    expect(changed.body.changed).toBe(true);
    const tok = await vaToken(ctx, s.paperId);
    const noop = await api.save(s.paperId, [al(v, s.dist, s.p, 2)], tok);
    expect(noop.status, body(noop)).toBe(200);
    expect(noop.body.changed).toBe(false);
    const recNoop = await api.reconcile(s.paperId, tok);
    expect(recNoop.status, body(recNoop)).toBe(200);
    expect(recNoop.body.changed).toBe(false);
    await ctx.db.master_vehicle.update({
      where: { id: v.id },
      data: { is_active: false },
    });
    const recChanged = await api.reconcile(s.paperId, tok);
    expect(recChanged.status, body(recChanged)).toBe(200);
    expect(recChanged.body.changed).toBe(true);
  });

  it('V-10 invalid body for a paper that does not exist → 400 (shape first), not 404', async () => {
    const res = await api.save(MISSING, 'not-an-array', null);
    expect(res.status).toBe(400);
    const res2 = await api.save(MISSING, [], null, { session: 'FOO' });
    expect(res2.status).toBe(400);
  });
});
