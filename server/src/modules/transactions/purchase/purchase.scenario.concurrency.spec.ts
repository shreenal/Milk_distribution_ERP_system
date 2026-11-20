/**
 * Purchase – concurrency, retry, failure handling, cross-module effects.
 * Scenarios: PU-160 .. PU-165, PU-170 .. PU-174   (PU-166 todo, PU-175 is Paper-owned)
 * (spec: PD-4, PD-7, PD-12, PD-19, PD-37, PD-63, PD-65, PD-72, VA-5.14, VA-13.1)
 * PU-164 is ADAPTED (same technique as Client Trays T-108 / Vehicle Allocation V-143): a save racing a real
 * morning submit needs every module ready, so the admin revert MORNING_SUBMITTED -> NIGHT_SUBMITTED is used.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Logger } from '@nestjs/common';
import {
  createOrdersTestContext,
  num,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  RETRY_MSG,
  STALE_PU,
  allocRow,
  al,
  cleanupPuTests,
  dairyRows,
  pe,
  puApi,
  puEntries,
  puPaper,
  puToken,
  purchaseScene,
  setAllocQty,
  twoSessionPurchaseScene,
  vaApi,
  vaToken,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';
import { PaperModule } from '../paper/paper.module.js';
import { PurchaseRepository } from './purchase.repository.js';

describe('Purchase concurrency, failure and cross-module effects', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof puApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({
      modules: [PurchaseModule, PaperModule],
    });
    api = puApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupPuTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  type Sc = Awaited<ReturnType<typeof purchaseScene>>;
  const E = (
    s: Sc,
    qty: unknown,
    p: { id: number } = s.p,
    o: { echo?: boolean } = {},
  ) => pe(ctx, s.paperId, s.v1, s.dist, p, qty, o);
  const tok = (s: Sc) => puToken(ctx, s.paperId);

  it('PU-160 / PU-148 double click: same payload and token twice → first succeeds, second 409; one write', async () => {
    const s = await purchaseScene(ctx);
    const first = await api.save(s.paperId, [await E(s, 4)], null);
    expect(first.status, body(first)).toBe(200);
    const second = await api.save(s.paperId, [await E(s, 4)], null);
    expect(second.status).toBe(409);
    expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
  });

  it('PU-161 lost response: retry with the old token → 409 although the data was saved; the same payload with the NEW token is a no-op', async () => {
    const s = await purchaseScene(ctx);
    const saved = await api.save(s.paperId, [await E(s, 4)], null);
    expect(saved.status).toBe(200);
    const retry = await api.save(s.paperId, [await E(s, 4)], null);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe(STALE_PU);
    const fresh = await api.save(
      s.paperId,
      [await E(s, 4)],
      saved.body.purchasePaperUpdatedAt,
    );
    expect(fresh.body.changed).toBe(false);
    expect(num((await puEntries(ctx, s.paperId))[0].purchased_qty)).toBe(4);
  });

  it('PU-162 Vehicle Allocation changes while the screen is open: the purchase token is unchanged, but the change is detected on every allocated cell', async () => {
    const s = await purchaseScene(ctx, { products: [{}, {}] });
    const [p0, p1] = s.products;
    const r0 = await api.save(s.paperId, [await E(s, 4, p0)], null);
    expect(r0.status, body(r0)).toBe(200);
    const loaded = await tok(s);
    const savedEcho = await E(s, 5, p0); // what the screen loaded
    const unsavedEcho = await E(s, 5, p1);
    await setAllocQty(
      ctx,
      (await allocRow(ctx, s.paperId, s.v1.id, p0.id))!.id,
      9,
    );
    await setAllocQty(
      ctx,
      (await allocRow(ctx, s.paperId, s.v1.id, p1.id))!.id,
      9,
    );
    expect(await tok(s)).toBe(loaded);
    for (const [name, e] of [
      ['saved cell, old echo', savedEcho],
      ['unsaved cell, old echo', unsavedEcho],
      ['unsaved cell, no echo', await E(s, 5, p1, { echo: false })],
    ] as const) {
      const r = await api.save(s.paperId, [e], loaded);
      expect(r.status, name).toBe(400);
    }
  });

  it('PU-163 [fault seam] unexpected exception after writes → masked 500 with requestId; entries, token and dairy rows rolled back', async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    vi.spyOn(
      PurchaseRepository.prototype,
      'createPurchaseEntries',
    ).mockRejectedValueOnce(new Error('boom: secret connection string'));
    const r = await api.save(s.paperId, [await E(s, 4)], null);
    expect(r.status).toBe(500);
    expect(r.body.message).toBe('Internal server error');
    expect(r.body.requestId).not.toBe('unknown');
    expect(body(r)).not.toContain('secret');
    expect(await puPaper(ctx, s.paperId)).toBeNull();
    expect(await puEntries(ctx, s.paperId)).toHaveLength(0);
    expect(await dairyRows(ctx, s.paperId)).toHaveLength(0);
  });

  it('PU-164 [adapted] a save racing a Paper status change: one outcome, the loser gets the 400 status error; never a 5xx or a half-write', async () => {
    for (let i = 0; i < 4; i++) {
      const s = await purchaseScene(ctx, { status: 'MORNING_SUBMITTED' });
      const e = await E(s, 4);
      const [save, revert] = await Promise.all([
        api.save(s.paperId, [e], null),
        ctx.call(
          'post',
          `/papers/${s.paperId}/revert-morning`,
          ctx.tokens.admin,
          { reason: `PU-164 race ${i}` },
        ),
      ]);
      expect(revert.status, body(revert)).toBe(201);
      expect([200, 400], `run ${i}: ${body(save)}`).toContain(save.status);
      if (save.status === 200) {
        expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
        expect(save.body.purchasePaperUpdatedAt).toBe(await tok(s));
      } else {
        expect(save.body.message).toBe(
          'Purchases cannot be edited in current workflow state',
        );
        expect(await puPaper(ctx, s.paperId)).toBeNull();
      }
    }
  }, 60000);

  it('PU-165 [fault seam] a retry after a serialization failure does not duplicate log lines (logs are written after commit)', async () => {
    const s = await purchaseScene(ctx);
    vi.spyOn(
      PurchaseRepository.prototype,
      'createPurchaseEntries',
    ).mockRejectedValueOnce(
      Object.assign(new Error('Write conflict'), { code: 'P2034' }),
    );
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const r = await api.save(s.paperId, [await E(s, 5)], null); // 50% short: critical
    expect(r.status, body(r)).toBe(200);
    expect(
      warn.mock.calls.filter((c) =>
        String(c[0]).includes('PURCHASE_CRITICAL_SHORTFALL'),
      ),
    ).toHaveLength(1);
  });

  it.todo(
    'PU-166 save with 5000 entries on a large real paper finishes inside the 10 s transaction (PD-75: measure before go-live; not testable deterministically)',
  );

  // ------------------------------------------------------------------ cross-module
  it('PU-170 Vehicle Allocation lowers a quantity: the entry becomes stale at read time; nothing is written to Purchase', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    const r = await api.save(
      t.paperId,
      [
        await pe(ctx, t.paperId, t.v, t.dist, t.p, t.qm, {
          session: 'MORNING',
        }),
      ],
      null,
    );
    expect(r.status, body(r)).toBe(200);
    const before = (await puEntries(ctx, t.paperId))[0];
    const token = await puToken(ctx, t.paperId);
    const va = await vaApi(ctx).save(
      t.paperId,
      [al(t.v, t.dist, t.p, 6)],
      await vaToken(ctx, t.paperId, 'MORNING'),
      { session: 'MORNING' },
    );
    expect(va.status, body(va)).toBe(200);
    const g = (await api.get(t.paperId)).body;
    expect(g.hasStaleRows).toBe(true);
    expect(await puToken(ctx, t.paperId)).toBe(token);
    const after = (await puEntries(ctx, t.paperId))[0];
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it('PU-171 Vehicle Allocation removes a row and later re-adds the same quantity: the entry is an orphan in between, then neither orphan nor stale', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    expect(
      (
        await api.save(
          t.paperId,
          [
            await pe(ctx, t.paperId, t.v, t.dist, t.p, t.qm, {
              session: 'MORNING',
            }),
          ],
          null,
        )
      ).status,
    ).toBe(200);
    const va = vaApi(ctx);
    const old = (await allocRow(ctx, t.paperId, t.v.id, t.p.id, 'MORNING'))!;
    const del = await va.save(
      t.paperId,
      [al(t.v, t.dist, t.p, 0)],
      await vaToken(ctx, t.paperId, 'MORNING'),
      { session: 'MORNING' },
    );
    expect(del.status, body(del)).toBe(200);
    expect((await api.get(t.paperId)).body.orphanedEntries).toHaveLength(1);
    const add = await va.save(
      t.paperId,
      [al(t.v, t.dist, t.p, t.qm)],
      await vaToken(ctx, t.paperId, 'MORNING'),
      { session: 'MORNING' },
    );
    expect(add.status, body(add)).toBe(200);
    expect(
      (await allocRow(ctx, t.paperId, t.v.id, t.p.id, 'MORNING'))!.id,
    ).not.toBe(old.id);
    const g = (await api.get(t.paperId)).body;
    expect(g.orphanedEntries).toEqual([]);
    expect(g.hasStaleRows).toBe(false);
  });

  it('PU-172 [seam] a Vehicle Allocation save that only refreshes its snapshot keeps allocation id and quantity; the entry is not stale', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    expect(
      (
        await api.save(
          t.paperId,
          [
            await pe(ctx, t.paperId, t.v, t.dist, t.p, t.qm, {
              session: 'MORNING',
            }),
          ],
          null,
        )
      ).status,
    ).toBe(200);
    const row = (await allocRow(ctx, t.paperId, t.v.id, t.p.id, 'MORNING'))!;
    // demand changes underneath (DB seam: Orders is locked once the paper is NIGHT_SUBMITTED)
    await ctx.db.order_sheet_items.updateMany({
      where: { order_sheet_id: t.sheet2.sheetId },
      data: { ordered_qty: 8 },
    });
    const va = await vaApi(ctx).save(
      t.paperId,
      [al(t.v, t.dist, t.p, t.qm)],
      await vaToken(ctx, t.paperId, 'MORNING'),
      { session: 'MORNING' },
    );
    expect(va.body.changed).toBe(true);
    const after = (await allocRow(ctx, t.paperId, t.v.id, t.p.id, 'MORNING'))!;
    expect([after.id, num(after.allocated_qty)]).toEqual([row.id, t.qm]);
    expect((await api.get(t.paperId)).body.hasStaleRows).toBe(false);
  });

  it('PU-173 allocation removed and the product demand falls to 0 → the entry is listed as an orphan', async () => {
    const s = await purchaseScene(ctx);
    expect((await api.save(s.paperId, [await E(s, 4)], null)).status).toBe(200);
    await ctx.db.vehicle_allocation.delete({
      where: { id: (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id },
    });
    await ctx.db.order_sheet_items.updateMany({
      where: { order_sheet_id: s.sheet.sheetId },
      data: { ordered_qty: 0 },
    });
    const g = (await api.get(s.paperId)).body;
    expect(g.orphanedEntries).toHaveLength(1);
    expect(g.purchases).toEqual([]);
  });

  it('PU-174 allocation removed while the product is still a column and the vehicle still has a row → the entry is an orphan, not a drawn stale cell', async () => {
    const s = await purchaseScene(ctx, { products: [{}, {}] });
    const [p0, p1] = s.products;
    expect(
      (await api.save(s.paperId, [await E(s, 4, p0), await E(s, 4, p1)], null))
        .status,
    ).toBe(200);
    await ctx.db.vehicle_allocation.delete({
      where: { id: (await allocRow(ctx, s.paperId, s.v1.id, p1.id))!.id },
    });
    const g = (await api.get(s.paperId)).body;
    expect(g.orphanedEntries.map((o: any) => o.productId)).toEqual([p1.id]);
    const row = g.purchases[0].rows.find((r: any) => r.vehicleId === s.v1.id);
    expect(row[`product_${p1.id}_meta`]).toBeUndefined();
    expect(row[`product_${p1.id}_variance`]).toBeUndefined();
    expect(row[`product_${p1.id}_stale`]).toBeUndefined();
  });

  void [RETRY_MSG];
});
