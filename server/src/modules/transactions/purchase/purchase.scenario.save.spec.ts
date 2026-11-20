/**
 * Purchase – save: workflow, token, entry rules, no-op.
 * Scenarios: PU-60 .. PU-107, PU-180 .. PU-184, PU-188, PU-189
 * (spec: PD-1, PD-3, PD-4, PD-9, PD-12, PD-20, PD-21, PD-27, PD-29, PD-30, PD-33, PD-37, PD-39, PD-41, PD-48, PD-52, PD-56, PD-57, PD-63, PD-74)
 * Expected results follow section F of the behavioral spec (amended PD-1, PD-3, PD-4, PD-41, PD-48, PD-63).
 * PU-105 is NOT implemented: the spec marks the behavior as undecided [U].
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
  iso,
  num,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  EDIT_NOT_ALLOWED,
  RETRY_MSG,
  STALE_PU,
  TIMEOUT_MSG,
  allocRow,
  breakOrderUnit,
  cleanupPuTests,
  dairyRows,
  pe,
  puApi,
  puEntries,
  puPaper,
  puToken,
  purchaseScene,
  setAllocQty,
  setLinksActive,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';
import { PurchaseRepository } from './purchase.repository.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';

const MISSING = 2000000000;

describe('Purchase save', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof puApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({ modules: [PurchaseModule] });
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
  const saveOk = async (
    s: Sc,
    entries: unknown[],
    expected?: string | null,
  ) => {
    const r = await api.save(
      s.paperId,
      entries,
      expected === undefined ? await tok(s) : expected,
    );
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };
  const warnCalls = (spy: { mock: { calls: unknown[][] } }, action: string) =>
    spy.mock.calls.filter((c) => String(c[0]).includes(action));

  // ------------------------------------------------------------------ C3
  describe('workflow and token', () => {
    it('PU-60 DRAFT / MORNING_SUBMITTED / FINALIZED → 400 workflow message, even with a stale token', async () => {
      const s = await purchaseScene(ctx);
      for (const status of [
        'DRAFT',
        'MORNING_SUBMITTED',
        'FINALIZED',
      ] as const) {
        await ctx.setStatus(s.sheet, status);
        const r = await api.save(
          s.paperId,
          [await E(s, 4)],
          '2020-01-01T00:00:00.000Z',
        );
        expect(r.status, status).toBe(400);
        expect(r.body.message).toBe(EDIT_NOT_ALLOWED);
      }
    });

    it('PU-61 first save with explicit null: changed true, header created, token returned, entry stored', async () => {
      const s = await purchaseScene(ctx);
      const r = await api.save(s.paperId, [await E(s, 4)], null);
      expect(r.status, body(r)).toBe(200);
      expect(r.body.changed).toBe(true);
      expect(r.body.purchasePaperUpdatedAt).toBe(
        (await puPaper(ctx, s.paperId))!.updated_at.toISOString(),
      );
      expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
    });

    it('PU-62 header exists, token null → 409 stale; stale token → 409', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const a = await api.save(s.paperId, [await E(s, 5)], null);
      expect(a.status).toBe(409);
      expect(a.body.message).toBe(STALE_PU);
      expect(
        (await api.save(s.paperId, [await E(s, 5)], '2020-01-01T00:00:00.000Z'))
          .status,
      ).toBe(409);
    });

    it('PU-63 identical payload, current token → changed false, current token, no deletions, no warnings, no dairy recalculation', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const t = await tok(s);
      const spy = vi.spyOn(DependencyOrchestratorService.prototype, 'execute');
      const r = await saveOk(s, [await E(s, 4)], t);
      expect(r).toMatchObject({
        changed: false,
        purchasePaperUpdatedAt: t,
        deletedEntryIds: [],
        shortfallWarnings: [],
      });
      expect(await tok(s)).toBe(t);
      expect(spy.mock.calls.filter((c) => c[0] === 'PURCHASE')).toHaveLength(0);
    });

    it('PU-64 identical payload with a stale token → 409', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      expect(
        (await api.save(s.paperId, [await E(s, 4)], '2020-01-01T00:00:00.000Z'))
          .status,
      ).toBe(409);
    });

    it('PU-65 response shape', async () => {
      const s = await purchaseScene(ctx);
      const r = await saveOk(s, [await E(s, 4)], null);
      expect(Object.keys(r).sort()).toEqual([
        'changed',
        'deletedEntryIds',
        'ignoredEntries',
        'purchasePaperUpdatedAt',
        'shortfallWarnings',
        'success',
      ]);
    });

    it('PU-66 two users save with the same token → one succeeds, the other 409; one write', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 1)], null);
      const t = await tok(s);
      const [a, b] = await Promise.all([
        api.save(s.paperId, [await E(s, 4)], t, { token: ctx.tokens.emp }),
        api.save(s.paperId, [await E(s, 6)], t, { token: ctx.tokens.emp2 }),
      ]);
      const ok = [a, b].filter((r) => r.status === 200);
      const lost = [a, b].filter((r) => r.status === 409);
      expect(ok, `${body(a)} ${body(b)}`).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect([STALE_PU, RETRY_MSG]).toContain(lost[0].body.message);
      expect(num((await puEntries(ctx, s.paperId))[0].purchased_qty)).toBe(
        ok[0] === a ? 4 : 6,
      );
    });

    it('PU-67 two concurrent FIRST saves → one succeeds, the other 409; one header', async () => {
      const s = await purchaseScene(ctx);
      const [a, b] = await Promise.all([
        api.save(s.paperId, [await E(s, 4)], null, { token: ctx.tokens.emp }),
        api.save(s.paperId, [await E(s, 6)], null, { token: ctx.tokens.emp2 }),
      ]);
      expect(
        [a, b].filter((r) => r.status === 200),
        `${body(a)} ${body(b)}`,
      ).toHaveLength(1);
      expect([a, b].filter((r) => r.status === 409)).toHaveLength(1);
      expect(
        await ctx.db.purchase_paper.count({
          where: { order_paper_id: s.paperId },
        }),
      ).toBe(1);
    });

    it('PU-68 one bad entry among several fails the whole request: no header, no entry, no dairy rows', async () => {
      const s = await purchaseScene(ctx, { products: [{ tray: true }, {}] });
      const bad = { ...(await E(s, 1, s.products[1])), vehicleId: MISSING };
      const r = await api.save(
        s.paperId,
        [await E(s, 4, s.products[0]), bad],
        null,
      );
      expect(r.status).toBe(400);
      expect(await puPaper(ctx, s.paperId)).toBeNull();
      expect(await dairyRows(ctx, s.paperId)).toHaveLength(0);
    });

    it('PU-69 [fault seam] serialization conflicts exhaust 3 attempts → 409 "conflicted with another update"; rolled back', async () => {
      const s = await purchaseScene(ctx);
      const spy = vi
        .spyOn(PurchaseRepository.prototype, 'createPurchaseEntries')
        .mockRejectedValue(
          Object.assign(new Error('Write conflict'), { code: 'P2034' }),
        );
      const r = await api.save(s.paperId, [await E(s, 4)], null);
      expect(r.status, body(r)).toBe(409);
      expect(r.body.message).toBe(RETRY_MSG);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(await puPaper(ctx, s.paperId)).toBeNull();
    });

    it('PU-70 [fault seam] transaction timeout → 409 "took too long and nothing was saved"', async () => {
      const s = await purchaseScene(ctx);
      vi.spyOn(
        PurchaseRepository.prototype,
        'createPurchaseEntries',
      ).mockRejectedValueOnce(
        Object.assign(new Error('closed'), { code: 'P2028' }),
      );
      const r = await api.save(s.paperId, [await E(s, 4)], null);
      expect(r.status, body(r)).toBe(409);
      expect(r.body.message).toBe(TIMEOUT_MSG);
      expect(await puPaper(ctx, s.paperId)).toBeNull();
    });
  });

  // ------------------------------------------------------------------ C4
  describe('entry rules', () => {
    it('PU-80 new allocated cell: link, rate, gatepass date, order-unit snapshot, tray type, allocation snapshot, amount frozen', async () => {
      const s = await purchaseScene(ctx, { products: [{ tray: true }] });
      await saveOk(s, [await E(s, 4)], null);
      const e = (await puEntries(ctx, s.paperId))[0];
      const alloc = (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!;
      expect(e).toMatchObject({
        product_link_id: s.p.links[s.dist.id],
        units_per_order_unit: 12,
        pricing_unit: 'L',
        source_allocation_id: alloc.id,
        tray_type_id: ctx.world.brandTray.trayTypeId,
      });
      expect([
        num(e.purchase_rate),
        num(e.pricing_quantity),
        num(e.source_allocated_qty),
        num(e.purchase_amount),
      ]).toEqual([56, 12, 10, 4 * 12 * 56]);
      expect(iso(e.gatepass_date)).toBe(iso(s.sheet.saleDate));
    });

    it('PU-81 quantity above the allocation → 400 "exceeds allocated quantity"; equal is accepted', async () => {
      const s = await purchaseScene(ctx);
      const r = await api.save(s.paperId, [await E(s, 10.01)], null);
      expect(r.status).toBe(400);
      expect(body(r)).toContain(
        'purchased quantity 10.01 exceeds allocated quantity 10',
      );
      await saveOk(s, [await E(s, 10)], null);
    });

    it('PU-82 positive quantity for a cell with no allocation → 400 "Allocation not found"', async () => {
      const s = await purchaseScene(ctx);
      const r = await api.save(
        s.paperId,
        [await pe(ctx, s.paperId, s.v2, s.dist, s.p, 5)],
        null,
      );
      expect(r.status).toBe(400);
      expect(body(r)).toContain('Allocation not found');
    });

    it('PU-83 zero for an allocated, unsaved cell is stored as a confirmed zero', async () => {
      const s = await purchaseScene(ctx);
      const r = await saveOk(s, [await E(s, 0)], null);
      expect(r.changed).toBe(true);
      expect(num((await puEntries(ctx, s.paperId))[0].purchased_qty)).toBe(0);
      const g = (await api.get(s.paperId)).body;
      expect(g.hasPurchaseEntries).toBe(true);
    });

    it('PU-84 zero for a cell never allocated and never saved → 200, not stored, reason NOT_ALLOCATED_AND_NOT_SAVED', async () => {
      const s = await purchaseScene(ctx);
      const r = await saveOk(
        s,
        [await pe(ctx, s.paperId, s.v2, s.dist, s.p, 0)],
        null,
      );
      expect(r.changed).toBe(false);
      expect(r.ignoredEntries).toEqual([
        expect.objectContaining({
          vehicleId: s.v2.id,
          reason: 'NOT_ALLOCATED_AND_NOT_SAVED',
        }),
      ]);
      expect(await puPaper(ctx, s.paperId)).toBeNull();
    });

    it('PU-85 / PU-88 / PU-181 no active link: new zero is ignored (MISSING_CONFIGURATION); new positive is 400', async () => {
      const s = await purchaseScene(ctx);
      await setLinksActive(ctx, s.p.links, false);
      const z = await saveOk(s, [await E(s, 0)], null);
      expect(z.changed).toBe(false);
      expect(z.ignoredEntries[0].reason).toBe('MISSING_CONFIGURATION');
      const p = await api.save(s.paperId, [await E(s, 4)], null);
      expect(p.status).toBe(400);
      expect(body(p)).toContain('does not have an active product link');
      // PU-181: positive for a cell with no allocation and no link at all
      const s2 = await purchaseScene(ctx);
      const r = await api.save(
        s2.paperId,
        [await pe(ctx, s2.paperId, s2.v2, ctx.world.distB, s2.p, 3)],
        null,
      );
      expect(r.status).toBe(400);
      expect(body(r)).toContain('does not have an active product link');
    });

    it('PU-86 new zero with rate or order unit missing → ignored MISSING_CONFIGURATION; no shortfall warning', async () => {
      // rate removed after the order and the allocation exist (OD-9.4: an order cannot be saved without a rate)
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      await ctx.world.deleteRates(s.products[0]);
      await breakOrderUnit(ctx, s.products[1].id);
      const r = await saveOk(
        s,
        [await E(s, 0, s.products[0]), await E(s, 0, s.products[1])],
        null,
      );
      expect(r.changed).toBe(false);
      expect(r.ignoredEntries.map((i: any) => i.reason)).toEqual([
        'MISSING_CONFIGURATION',
        'MISSING_CONFIGURATION',
      ]);
      expect(r.shortfallWarnings).toEqual([]);
    });

    it('PU-87 new positive with rate missing or order unit missing → 400, every problem listed', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      await ctx.world.deleteRates(s.products[0]);
      await breakOrderUnit(ctx, s.products[1].id);
      const r = await api.save(
        s.paperId,
        [await E(s, 4, s.products[0]), await E(s, 4, s.products[1])],
        null,
      );
      expect(r.status, body(r)).toBe(400);
      expect(r.body.details).toHaveLength(2);
      expect(body(r)).toContain('no purchase rate found for');
      expect(body(r)).toContain('order unit configuration is missing');
    });

    it('PU-89 unknown vehicle / distributor / product id, positive or zero → 400, all listed together', async () => {
      const s = await purchaseScene(ctx);
      const base = await E(s, 5);
      const r = await api.save(
        s.paperId,
        [
          { ...base, vehicleId: MISSING },
          { ...base, distributorId: MISSING, purchasedQty: 0 },
          { ...base, productId: MISSING },
        ],
        null,
      );
      expect(r.status).toBe(400);
      for (const m of [
        `Invalid vehicle ${MISSING}`,
        `Invalid distributor ${MISSING}`,
        `Invalid product ${MISSING}`,
      ])
        expect(r.body.details).toContain(m);
    });

    it('PU-90 same key twice, both explicit → 400 "Duplicate purchase entry"', async () => {
      const s = await purchaseScene(ctx);
      const r = await api.save(s.paperId, [await E(s, 4), await E(s, 5)], null);
      expect(r.status).toBe(400);
      expect(body(r)).toContain('Duplicate purchase entry');
    });

    it('PU-91 same key, one null and one explicit → accepted as one entry', async () => {
      const s = await purchaseScene(ctx);
      const r = await saveOk(s, [await E(s, null), await E(s, 4)], null);
      expect(r.changed).toBe(true);
      expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
    });

    it('PU-92 [seam] updating a saved entry keeps link, rate, order-unit snapshot, gatepass date; quantity and amount change', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const before = (await puEntries(ctx, s.paperId))[0];
      await ctx.db.distributor_product_rate.updateMany({
        where: { product_link_id: s.p.links[s.dist.id] },
        data: { purchase_rate: 99 },
      });
      await ctx.db.product_order_unit.updateMany({
        where: { master_products: { some: { id: s.p.id } } },
        data: { pricing_quantity: 24 },
      });
      await setLinksActive(ctx, s.p.links, false);
      await saveOk(s, [await E(s, 6)]);
      const after = (await puEntries(ctx, s.paperId))[0];
      expect(after.product_link_id).toBe(before.product_link_id);
      expect([
        num(after.purchase_rate),
        num(after.pricing_quantity),
        after.gatepass_date.getTime(),
      ]).toEqual([56, 12, before.gatepass_date.getTime()]);
      expect([num(after.purchased_qty), num(after.purchase_amount)]).toEqual([
        6,
        6 * 12 * 56,
      ]);
    });

    it('PU-93 echo missing for a cell that has an allocation (unsaved or saved) → 400 "sent back exactly as loaded"', async () => {
      const s = await purchaseScene(ctx);
      const unsaved = await api.save(
        s.paperId,
        [await E(s, 4, s.p, { echo: false })],
        null,
      );
      expect(unsaved.status).toBe(400);
      expect(body(unsaved)).toContain('must be sent back exactly as loaded');
      await saveOk(s, [await E(s, 4)], null);
      const e = await E(s, 5);
      for (const drop of ['sourceAllocationId', 'sourceAllocatedQty']) {
        const r = await api.save(
          s.paperId,
          [{ ...e, [drop]: undefined }],
          await tok(s),
        );
        expect(r.status, drop).toBe(400);
        expect(body(r)).toContain('must be sent back exactly as loaded');
      }
    });

    it('PU-94 saved entry, echo differs from the current allocation → 400 "Allocation modified or removed"', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const e = { ...(await E(s, 5)), sourceAllocatedQty: 9 };
      const r = await api.save(s.paperId, [e], await tok(s));
      expect(r.status).toBe(400);
      expect(body(r)).toContain('Allocation modified or removed');
    });

    it('PU-95 saved entry whose allocation was removed, quantity zero or positive → 400 "Allocation modified or removed"', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const e = await E(s, 4);
      await ctx.db.vehicle_allocation.delete({
        where: { id: (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id },
      });
      for (const q of [0, 3]) {
        const r = await api.save(
          s.paperId,
          [{ ...e, purchasedQty: q }],
          await tok(s),
        );
        expect(r.status, String(q)).toBe(400);
        expect(body(r)).toContain('Allocation modified or removed');
      }
    });

    it('PU-96 unsaved cell: echo different from the current allocation → 400; echo omitted → 400', async () => {
      const s = await purchaseScene(ctx);
      const stale = await E(s, 5);
      await setAllocQty(
        ctx,
        (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id,
        12,
      );
      const a = await api.save(s.paperId, [stale], null);
      expect(a.status).toBe(400);
      expect(body(a)).toContain('Allocation modified or removed');
      const b = await api.save(
        s.paperId,
        [await E(s, 5, s.p, { echo: false })],
        null,
      );
      expect(b.status).toBe(400);
    });

    it('PU-97 stale entry, echo of the current allocation, quantity within it → accepted; snapshot refreshed; stale cleared', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 10)], null);
      await setAllocQty(
        ctx,
        (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id,
        8,
      );
      await saveOk(s, [await E(s, 8)]);
      expect(
        num((await puEntries(ctx, s.paperId))[0].source_allocated_qty),
      ).toBe(8);
      expect((await api.get(s.paperId)).body.hasStaleRows).toBe(false);
    });

    it('PU-98 / PU-183 saved entry above a lowered allocation, sent back unchanged → 200, left as is, reported UNCHANGED_EXCEEDS_ALLOCATION; other cells saved; still stale', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      const [p0, p1] = s.products;
      await saveOk(s, [await E(s, 10, p0), await E(s, 10, p1)], null);
      await setAllocQty(
        ctx,
        (await allocRow(ctx, s.paperId, s.v1.id, p0.id))!.id,
        8,
      );
      const r = await saveOk(s, [await E(s, 10, p0), await E(s, 9, p1)]);
      expect(r.changed).toBe(true);
      expect(r.ignoredEntries).toEqual([
        expect.objectContaining({
          productId: p0.id,
          reason: 'UNCHANGED_EXCEEDS_ALLOCATION',
        }),
      ]);
      const rows = await puEntries(ctx, s.paperId);
      expect(num(rows.find((x) => x.product_id === p0.id)!.purchased_qty)).toBe(
        10,
      );
      expect(num(rows.find((x) => x.product_id === p1.id)!.purchased_qty)).toBe(
        9,
      );
      expect((await api.get(s.paperId)).body.hasStaleRows).toBe(true);
    });

    it('PU-184 saved entry above a lowered allocation with a CHANGED quantity still above it → 400 "exceeds"', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 10)], null);
      await setAllocQty(
        ctx,
        (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id,
        8,
      );
      const r = await api.save(s.paperId, [await E(s, 9)], await tok(s));
      expect(r.status).toBe(400);
      expect(body(r)).toContain('exceeds allocated quantity 8');
    });

    it('PU-99 an entry both saved and deleted in one request → 400', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const id = (await puEntries(ctx, s.paperId))[0].id;
      const r = await api.save(s.paperId, [await E(s, 5)], await tok(s), {
        extra: { deletedEntryIds: [id] },
      });
      expect(r.status).toBe(400);
      expect(body(r)).toContain('cannot be saved and deleted in one request');
    });

    it('PU-100 a payload with 2 of 3 saved entries touches only those two; nothing is deleted by omission', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}, {}] });
      const [a, b, c] = s.products;
      await saveOk(
        s,
        [await E(s, 5, a), await E(s, 5, b), await E(s, 5, c)],
        null,
      );
      await saveOk(s, [await E(s, 6, a), await E(s, 7, b)]);
      const q = (await puEntries(ctx, s.paperId)).map((e) => [
        e.product_id,
        num(e.purchased_qty),
      ]);
      expect(q).toEqual([
        [a.id, 6],
        [b.id, 7],
        [c.id, 5],
      ]);
    });

    it('PU-101 entries [] with saved entries and no delete / purge / re-evaluate → 400 guard', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const r = await api.save(s.paperId, [], await tok(s));
      expect(r.status).toBe(400);
      expect(body(r)).toContain(
        'entries is empty but purchases are already saved',
      );
      expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
    });

    it('PU-102 entries [] with nothing saved → 200 changed false; no header created', async () => {
      const s = await purchaseScene(ctx);
      const r = await saveOk(s, [], null);
      expect(r.changed).toBe(false);
      expect(await puPaper(ctx, s.paperId)).toBeNull();
    });

    it('PU-103 payload of only untracked entries while entries are saved → no-op; nothing deleted', async () => {
      const s = await purchaseScene(ctx);
      await saveOk(s, [await E(s, 4)], null);
      const r = await saveOk(s, [await E(s, null)]);
      expect(r.changed).toBe(false);
      expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
    });

    it('PU-104 several problems in one request → one 400 { message, details[] } with names, not ids', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      const r = await api.save(
        s.paperId,
        [await E(s, 5), await E(s, 6), await E(s, 11, s.products[1])],
        null,
      );
      expect(r.status).toBe(400);
      expect(r.body.details.length).toBeGreaterThanOrEqual(2);
      expect(body(r)).toContain(s.dist.name);
    });

    it.todo(
      'PU-105 entry whose category does not match the allocation key (spec: observed, undecided [U])',
    );

    it('PU-106 saved entry with an empty tray type, saved again → resolved once from current rules and stored', async () => {
      const s = await purchaseScene(ctx, { products: [{ tray: true }] });
      await saveOk(s, [await E(s, 4)], null);
      await ctx.db.purchase_entry.updateMany({
        where: { vehicle_id: s.v1.id },
        data: { tray_type_id: null },
      });
      await saveOk(s, [await E(s, 6)]);
      expect((await puEntries(ctx, s.paperId))[0].tray_type_id).toBe(
        ctx.world.brandTray.trayTypeId,
      );
    });

    it('PU-107 tray rule changed after save, ordinary save → stored tray type unchanged', async () => {
      const s = await purchaseScene(ctx, { products: [{ tray: true }] });
      await saveOk(s, [await E(s, 4)], null);
      await ctx.db.product_tray_rule.updateMany({
        where: { brand_id: ctx.world.brandTray.id },
        data: { is_active: false },
      });
      await saveOk(s, [await E(s, 6)]);
      expect((await puEntries(ctx, s.paperId))[0].tray_type_id).toBe(
        ctx.world.brandTray.trayTypeId,
      );
    });

    it('PU-180 zero for a never-allocated, never-saved cell whose distributor has no link → 200, ignored NOT_ALLOCATED_AND_NOT_SAVED', async () => {
      const s = await purchaseScene(ctx);
      const r = await saveOk(
        s,
        [await pe(ctx, s.paperId, s.v2, ctx.world.distB, s.p, 0)],
        null,
      );
      expect(r.ignoredEntries[0].reason).toBe('NOT_ALLOCATED_AND_NOT_SAVED');
      expect(r.changed).toBe(false);
    });

    it('PU-182 echo present and matching for a saved cell and for an unsaved allocated cell → accepted', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      const [p0, p1] = s.products;
      await saveOk(s, [await E(s, 4, p0)], null);
      const r = await saveOk(s, [await E(s, 5, p0), await E(s, 6, p1)]);
      expect(r.changed).toBe(true);
      expect(await puEntries(ctx, s.paperId)).toHaveLength(2);
    });

    it('PU-188 a save that changes a non-critical entry does not report or log the critical entry it leaves out', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      const [p0, p1] = s.products;
      await saveOk(s, [await E(s, 10, p0), await E(s, 5, p1)], null); // p1: 50% short
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const r = await saveOk(s, [await E(s, 9, p0)]);
      expect(r.shortfallWarnings).toEqual([]);
      expect(warnCalls(warn, 'PURCHASE_CRITICAL_SHORTFALL')).toHaveLength(0);
    });

    it('PU-189 a critical entry sent back unchanged in a save that changes something else → no warning for it', async () => {
      const s = await purchaseScene(ctx, { products: [{}, {}] });
      const [p0, p1] = s.products;
      await saveOk(s, [await E(s, 10, p0), await E(s, 5, p1)], null);
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const r = await saveOk(s, [await E(s, 9, p0), await E(s, 5, p1)]);
      expect(r.shortfallWarnings).toEqual([]);
      expect(warnCalls(warn, 'PURCHASE_CRITICAL_SHORTFALL')).toHaveLength(0);
    });
  });
});
