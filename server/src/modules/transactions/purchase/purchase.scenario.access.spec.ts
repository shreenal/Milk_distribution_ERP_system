/**
 * Purchase – access, throttling, ids, request shape, token contract.
 * Scenarios: PU-01 .. PU-20   (spec: PD-2, PD-10, PD-12, PD-23, PD-27, PD-34, PD-39, PD-55, PD-59, PD-60, PD-71, PD-72)
 *
 * Known limits (see coverage map): NaN / Infinity cannot be serialized to JSON (PU-12); a legacy over-precise stored
 * quantity cannot exist because purchase_entry.purchased_qty is Decimal(10,2) (PU-14, tolerance half).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  STALE_PU,
  cleanupPuTests,
  pe,
  puApi,
  puEntries,
  puPaper,
  puToken,
  purchaseScene,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';

const MISSING = 2000000000;

describe('Purchase access & request shape', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof puApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({ modules: [PurchaseModule] });
    api = puApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupPuTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);

  it('PU-01 no / garbage / expired JWT → 401 on GET, save, sign-off, recalculate; nothing changes', async () => {
    const s = await purchaseScene(ctx);
    const base = `/purchases/${s.paperId}`;
    const expired = ctx.tokenFor(ctx.users.emp, { expiresIn: '-10s' });
    const calls: Record<
      string,
      (t?: string) => PromiseLike<{ status: number }>
    > = {
      get: (t) => ctx.call('get', base, t),
      save: (t) =>
        ctx.call('post', base, t, { entries: [], expectedUpdatedAt: null }),
      signOff: (t) =>
        ctx.call('post', `${base}/sign-off-zero-allocation`, t, {
          expectedUpdatedAt: null,
        }),
      recalc: (t) =>
        ctx.call('post', `${base}/recalculate-rates`, t, {
          expectedUpdatedAt: null,
          reason: 'x',
        }),
    };
    for (const [name, fn] of Object.entries(calls)) {
      for (const tok of [undefined, 'garbage', expired]) {
        expect(
          (await fn(tok)).status,
          `${name} ${String(tok).slice(0, 8)}`,
        ).toBe(401);
      }
    }
    expect(await puPaper(ctx, s.paperId)).toBeNull();
  });

  it('PU-02 EMPLOYEE and ADMIN may GET, save and sign off; EMPLOYEE on recalculate → 403', async () => {
    const s = await purchaseScene(ctx);
    for (const t of [ctx.tokens.emp, ctx.tokens.admin])
      expect((await api.get(s.paperId, t)).status).toBe(200);
    const first = await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
      { token: ctx.tokens.emp },
    );
    expect(first.status, body(first)).toBe(200);
    const second = await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 5)],
      await puToken(ctx, s.paperId),
      {
        token: ctx.tokens.admin,
      },
    );
    expect(second.status, body(second)).toBe(200);
    // sign-off: allowed for an employee (not 403); it is a 400 only because an allocation exists
    expect(
      (await api.signOff(s.paperId, await puToken(ctx, s.paperId))).status,
    ).toBe(400);
    expect(
      (await api.recalc(s.paperId, null, 'x', { token: ctx.tokens.emp }))
        .status,
    ).toBe(403);
    expect(
      (await api.recalc(s.paperId, null, 'x', { token: ctx.tokens.admin }))
        .status,
    ).toBe(400); // allowed, wrong status
  });

  it('PU-03 deactivated user with an unexpired token → 401', async () => {
    const s = await purchaseScene(ctx);
    const inactive = await ctx.world.addUser('EMPLOYEE', false);
    expect((await api.get(s.paperId, ctx.tokenFor(inactive))).status).toBe(401);
  });

  it('PU-04 EMPLOYEE purgeAll / reevaluateTrays → 403 (wins over 404); ADMIN allowed', async () => {
    const s = await purchaseScene(ctx);
    for (const extra of [
      { purgeAll: true, purgeScope: 'PAPER' },
      { reevaluateTrays: true },
    ]) {
      const r = await api.save(s.paperId, [], null, { extra });
      expect(r.status, body(r)).toBe(403);
      const missing = await api.save(MISSING, [], null, { extra });
      expect(missing.status, `missing paper ${body(missing)}`).toBe(403);
    }
    const purge = await api.save(s.paperId, [], null, {
      token: ctx.tokens.admin,
      extra: { purgeAll: true, purgeScope: 'PAPER' },
    });
    expect(purge.status, body(purge)).toBe(200);
    const re = await api.save(s.paperId, [], null, {
      token: ctx.tokens.admin,
      extra: { reevaluateTrays: true },
    });
    expect(re.status, body(re)).toBe(200);
  });

  it('PU-05 11th save / 11th sign-off in 60 s → 429; 6th recalculate → 429; another user unaffected', async () => {
    const t = await createOrdersTestContext({
      throttle: true,
      modules: [PurchaseModule],
    });
    try {
      const tapi = puApi(t);
      const s = await purchaseScene(t);
      // empty save with nothing stored: a clean no-op 200 that still counts
      const save = (tok: string) =>
        tapi.save(s.paperId, [], null, { token: tok });
      for (let i = 1; i <= 10; i++)
        expect((await save(t.tokens.emp)).status, `save ${i}`).toBe(200);
      expect((await save(t.tokens.emp)).status).toBe(429);
      expect((await save(t.tokens.admin)).status).toBe(200);
      // sign-off: 400 (allocation exists) still counts towards the limit
      for (let i = 1; i <= 10; i++)
        expect(
          (await tapi.signOff(s.paperId, null)).status,
          `signoff ${i}`,
        ).toBe(400);
      expect((await tapi.signOff(s.paperId, null)).status).toBe(429);
      for (let i = 1; i <= 5; i++)
        expect(
          (await tapi.recalc(s.paperId, null, 'x')).status,
          `recalc ${i}`,
        ).toBe(400);
      expect((await tapi.recalc(s.paperId, null, 'x')).status).toBe(429);
      // GET uses the global limit and is not throttled by the above
      expect((await tapi.get(s.paperId)).status).toBe(200);
    } finally {
      await cleanupPuTests(t);
      await t.close();
    }
  }, 60000);

  it('PU-06 paperId abc / 0 / -1 / 2147483648 → 400 "Invalid id" on all endpoints; 007-style accepted', async () => {
    const s = await purchaseScene(ctx);
    for (const bad of ['abc', '0', '-1', '2147483648']) {
      for (const [name, r] of Object.entries({
        get: await api.get(bad),
        save: await api.save(bad, [], null),
        signOff: await api.signOff(bad, null),
        recalc: await api.recalc(bad, null, 'x'),
      })) {
        expect(r.status, `${name} ${bad}`).toBe(400);
        expect(r.body.message).toBe('Invalid id');
      }
    }
    expect((await api.get(`000${s.paperId}`)).status).toBe(200);
  });

  it('PU-07 missing paper → 404 "Order paper not found" on GET, save, sign-off, recalculate; invalid body → 400 first', async () => {
    const res = {
      get: await api.get(MISSING),
      save: await api.save(MISSING, [], null),
      signOff: await api.signOff(MISSING, null),
      recalc: await api.recalc(MISSING, null, 'x'),
    };
    for (const [k, r] of Object.entries(res)) {
      expect(r.status, k).toBe(404);
      expect(r.body.message, k).toBe('Order paper not found');
    }
    expect((await api.save(MISSING, 'not-an-array', null)).status).toBe(400);
  });

  it('PU-08 unknown field at top level (confirmDeletions) or inside an entry (totalAmount) → 400; nothing saved', async () => {
    const s = await purchaseScene(ctx);
    const e = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4);
    expect(
      (
        await api.save(s.paperId, [e], null, {
          extra: { confirmDeletions: true },
        })
      ).status,
    ).toBe(400);
    expect(
      (await api.save(s.paperId, [{ ...e, totalAmount: 5 }], null)).status,
    ).toBe(400);
    expect(await puPaper(ctx, s.paperId)).toBeNull();
  });

  it('PU-09 successful save, recalculate and sign-off, including no-ops, answer 200 (not 201)', async () => {
    const s = await purchaseScene(ctx);
    const e = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4);
    const changed = await api.save(s.paperId, [e], null);
    expect(changed.status, body(changed)).toBe(200);
    expect(changed.body.changed).toBe(true);
    const noop = await api.save(s.paperId, [e], await puToken(ctx, s.paperId));
    expect(noop.status, body(noop)).toBe(200);
    expect(noop.body.changed).toBe(false);

    const z = await purchaseScene(ctx, { alloc: 0 });
    const so = await api.signOff(z.paperId, null);
    expect(so.status, body(so)).toBe(200);
    expect(so.body.changed).toBe(true);

    const r = await purchaseScene(ctx, { status: 'REOPENED' });
    const rc = await api.recalc(r.paperId, null, 'check');
    expect(rc.status, body(rc)).toBe(200);
    expect(rc.body.changed).toBe(false);
  });

  it('PU-10 vehicleId / distributorId / productId 0, 1.5, 2147483648; deliverySession or category FOO → 400', async () => {
    const s = await purchaseScene(ctx);
    const good = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 1);
    const variants: Record<string, unknown>[] = [];
    for (const bad of [0, 1.5, 2147483648]) {
      variants.push(
        { ...good, vehicleId: bad },
        { ...good, distributorId: bad },
        { ...good, productId: bad },
      );
    }
    variants.push(
      { ...good, deliverySession: 'FOO' },
      { ...good, category: 'FOO' },
    );
    for (const [i, v] of variants.entries())
      expect(
        (await api.save(s.paperId, [v], null)).status,
        `variant ${i}`,
      ).toBe(400);
  });

  it('PU-11 purchasedQty 10000, 5.5, 5, 0 are accepted by shape and stored', async () => {
    const s = await purchaseScene(ctx, { qty: 10000 });
    let tok: string | null = null;
    for (const q of [10000, 5.5, 5, 0]) {
      const r = await api.save(
        s.paperId,
        [await pe(ctx, s.paperId, s.v1, s.dist, s.p, q)],
        tok,
      );
      expect(r.status, `${q}: ${body(r)}`).toBe(200);
      tok = await puToken(ctx, s.paperId);
      expect(Number((await puEntries(ctx, s.paperId))[0].purchased_qty)).toBe(
        q,
      );
    }
  });

  it('PU-12 purchasedQty "5", -1, 10000.01 → 400; nothing saved', async () => {
    const s = await purchaseScene(ctx);
    for (const q of ['5', -1, 10000.01]) {
      expect(
        (
          await api.save(
            s.paperId,
            [await pe(ctx, s.paperId, s.v1, s.dist, s.p, q)],
            null,
          )
        ).status,
        String(q),
      ).toBe(400);
    }
    expect(await puPaper(ctx, s.paperId)).toBeNull();
  });

  it('PU-13 purchasedQty null, "" or omitted = untracked: no entry, no operation', async () => {
    const s = await purchaseScene(ctx);
    const e = await pe(ctx, s.paperId, s.v1, s.dist, s.p, null);
    for (const entry of [
      e,
      { ...e, purchasedQty: '' },
      { ...e, purchasedQty: undefined },
    ]) {
      const r = await api.save(s.paperId, [entry], null);
      expect(r.status, body(r)).toBe(200);
      expect(r.body).toMatchObject({
        changed: false,
        purchasePaperUpdatedAt: null,
      });
    }
    expect(await puPaper(ctx, s.paperId)).toBeNull();
  });

  it('PU-14 new quantity 5.255 → 400 "at most 2 decimal places", never rounded; a stale token wins over it (409)', async () => {
    const s = await purchaseScene(ctx);
    const e = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 5.255);
    const r = await api.save(s.paperId, [e], null);
    expect(r.status, body(r)).toBe(400);
    expect(body(r)).toContain('at most 2 decimal places');
    expect(await puEntries(ctx, s.paperId)).toHaveLength(0);
    // PD-27: the precision check runs after the token check
    await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    expect((await api.save(s.paperId, [e], null)).status).toBe(409);
  });

  it('PU-15 expectedUpdatedAt omitted on save, sign-off, recalculate → 400', async () => {
    const s = await purchaseScene(ctx);
    expect((await api.save(s.paperId, [], undefined)).status).toBe(400);
    expect((await api.signOff(s.paperId, undefined)).status).toBe(400);
    expect((await api.recalc(s.paperId, undefined, 'x')).status).toBe(400);
  });

  it('PU-16 explicit null matches only while no purchase paper exists; otherwise 409', async () => {
    const s = await purchaseScene(ctx);
    const ok = await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    expect(ok.status, body(ok)).toBe(200);
    const res = await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 5)],
      null,
    );
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(STALE_PU);
  });

  it('PU-17 token "abc" → 400 "Invalid expectedUpdatedAt"; well-formed but different (date-only) → 409', async () => {
    const s = await purchaseScene(ctx);
    await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    const e = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 5);
    const bad = await api.save(s.paperId, [e], 'abc');
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.message)).toContain(
      'Invalid expectedUpdatedAt',
    );
    expect((await api.save(s.paperId, [e], '2020-01-01')).status).toBe(409);
  });

  it('PU-18 entries missing / not an array / more than 5000 → 400', async () => {
    const s = await purchaseScene(ctx);
    const url = `/purchases/${s.paperId}`;
    expect(
      (await ctx.call('post', url, ctx.tokens.emp, { expectedUpdatedAt: null }))
        .status,
    ).toBe(400);
    expect((await api.save(s.paperId, 'x', null)).status).toBe(400);
    const e = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 0);
    expect(
      (
        await api.save(
          s.paperId,
          Array.from({ length: 5001 }, () => e),
          null,
        )
      ).status,
    ).toBe(400);
  });

  it('PU-19 reason / shortfallComment longer than 1000 → 400; surrounding spaces are trimmed', async () => {
    const s = await purchaseScene(ctx);
    const long = 'x'.repeat(1001);
    expect(
      (await api.save(s.paperId, [], null, { extra: { reason: long } })).status,
    ).toBe(400);
    expect(
      (
        await api.save(s.paperId, [], null, {
          extra: { shortfallComment: long },
        })
      ).status,
    ).toBe(400);
    expect((await api.recalc(s.paperId, null, long)).status).toBe(400);
    const r = await purchaseScene(ctx, { status: 'REOPENED' });
    expect((await api.recalc(r.paperId, null, '  ok  ')).status).toBe(200);
    expect(
      (
        await api.save(s.paperId, [], null, {
          extra: { shortfallComment: '  note  ' },
        })
      ).status,
    ).toBe(200);
  });

  it('PU-20 recalculate with reason blank or whitespace → 400', async () => {
    const s = await purchaseScene(ctx, { status: 'REOPENED' });
    for (const reason of ['', '   ', undefined]) {
      expect(
        (await api.recalc(s.paperId, null, reason)).status,
        String(reason),
      ).toBe(400);
    }
  });
});
