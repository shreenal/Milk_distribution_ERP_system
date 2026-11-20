/**
 * Orders – access, throttling, request shape.
 * Scenarios: S-01 .. S-06   (spec: OD-1.1, OD-1.2, OD-1.3, OD-5.5, OD-5.8)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  n,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';

describe('Orders access & request shape', () => {
  let ctx: OrdersCtx;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  it('S-01 no / garbage / expired JWT → 401 on all 7 endpoints', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const { api, call } = ctx;
    const expired = ctx.tokenFor(ctx.users.emp, { expiresIn: '-10s' });
    const calls: Record<
      string,
      (t?: string) => PromiseLike<{ status: number }>
    > = {
      getSheet: (t) => api.getSheet(sheet.sheetId, t ?? null),
      getProducts: (t) => api.getProducts('MILK', t ?? null),
      getItems: (t) => api.getItems(sheet.sheetId, t ?? null),
      nightSave: (t) =>
        call('post', `/orders/sheet/${sheet.sheetId}/night-save`, t, {
          entries: [n(c, p, 1)],
          expectedUpdatedAt: null,
        }),
      morningSave: (t) =>
        call('post', `/orders/sheet/${sheet.sheetId}/morning-save`, t, {
          entries: [{ clientId: c.id, productId: p.id, deliveredQty: 1 }],
          expectedUpdatedAt: null,
        }),
      addProduct: (t) =>
        call('post', `/orders/sheet/${sheet.sheetId}/products`, t, {
          productId: p.id,
          expectedUpdatedAt: null,
        }),
      removeProduct: (t) =>
        call(
          'delete',
          `/orders/sheet/${sheet.sheetId}/products/${p.id}?expectedUpdatedAt=null`,
          t,
        ),
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
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
  });

  it('S-02 valid EMPLOYEE and ADMIN JWT are allowed (reads and a save)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    for (const t of [ctx.tokens.emp, ctx.tokens.admin]) {
      expect((await ctx.api.getSheet(sheet.sheetId, t)).status).toBe(200);
      expect((await ctx.api.getProducts('MILK', t)).status).toBe(200);
      expect((await ctx.api.getItems(sheet.sheetId, t)).status).toBe(200);
    }
    // admin passes through the role hierarchy on a write endpoint
    const res = await ctx.api.night(
      sheet.sheetId,
      [n(c, p, 1)],
      null,
      ctx.tokens.admin,
    );
    expect(res.status).toBe(200);
  });

  it('S-03 deactivated user with an unexpired token → 401', async () => {
    const { sheet } = await ctx.world.scene();
    const inactive = await ctx.world.addUser('EMPLOYEE', false);
    const res = await ctx.api.getSheet(sheet.sheetId, ctx.tokenFor(inactive));
    expect(res.status).toBe(401);
  });

  it('S-04 61st night-save within 60 s → 429; another user unaffected', async () => {
    const t = await createOrdersTestContext({ throttle: true });
    try {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await t.world.scene();
      // no-op saves (blank entry) so the sheet stays unchanged; each still counts toward the limit
      const noop = (tok: string) =>
        t.api.night(
          sheet.sheetId,
          [{ clientId: c.id, productId: p.id }],
          null,
          tok,
        );
      for (let i = 1; i <= 60; i++) {
        const r = await noop(t.tokens.emp);
        expect(r.status, `request ${i}`).toBe(200);
      }
      expect((await noop(t.tokens.emp)).status).toBe(429);
      expect((await noop(t.tokens.admin)).status).toBe(200);
    } finally {
      await t.close();
    }
  }, 60000);

  it('S-05 unknown body fields (price / rate / extra) → 400, nothing saved', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const { call, tokens } = ctx;
    const base = `/orders/sheet/${sheet.sheetId}`;
    const bodies: [string, string, unknown][] = [
      [
        'night entry field',
        '/night-save',
        { entries: [{ ...n(c, p, 2), rate: 5 }], expectedUpdatedAt: null },
      ],
      [
        'night top field',
        '/night-save',
        { entries: [n(c, p, 2)], expectedUpdatedAt: null, price: 1 },
      ],
      [
        'morning entry field',
        '/morning-save',
        {
          entries: [
            { clientId: c.id, productId: p.id, deliveredQty: 1, price: 9 },
          ],
          expectedUpdatedAt: null,
        },
      ],
      [
        'add product field',
        '/products',
        { productId: p.id, expectedUpdatedAt: null, rate: 1 },
      ],
    ];
    for (const [label, suffix, body] of bodies) {
      const res = await call('post', base + suffix, tokens.emp, body);
      expect(res.status, label).toBe(400);
    }
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
  });

  it("S-06 any employee (or admin) can edit another group's sheet (OD-1.3, no per-group scoping)", async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    // emp2 is not tied to any group in the data model; the sheet belongs to a group created for this scene
    const res = await ctx.api.night(
      sheet.sheetId,
      [n(c, p, 2)],
      null,
      ctx.tokens.emp2,
    );
    expect(res.status).toBe(200);
    expect(await ctx.line(sheet.sheetId, c.id, p.id)).not.toBeNull();
  });
});
