/**
 * Purchase – grid view (GET /purchases/:paperId).
 * Scenarios: PU-30 .. PU-51, PU-185, PU-186, PU-187   (spec: PD-4, PD-7, PD-22, PD-26, PD-31, PD-37, PD-40..PD-53, PD-61, PD-67, PD-68)
 * Expected results follow the post-decision section F of the behavioral spec (amended PD-7, PD-37, PD-44, PD-61).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  leafFields,
  pathTo,
  type ColumnNode,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  HOUR,
  addDays,
  allocRow,
  breakOrderUnit,
  cellOf,
  cleanupPuTests,
  istStart,
  pe,
  puApi,
  puEntries,
  puPaper,
  purchaseScene,
  seedAlloc,
  setAllocQty,
  setLinksActive,
  twoSessionPurchaseScene,
  vaApi,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';

describe('Purchase grid view', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof puApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({ modules: [PurchaseModule] });
    api = puApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupPuTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const view = async (paperId: number) => {
    const r = await api.get(paperId);
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };
  const saveOk = async (
    paperId: number,
    entries: unknown[],
    tok: string | null,
  ) => {
    const r = await api.save(paperId, entries, tok);
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };
  const tokenOf = async (paperId: number) =>
    (await puPaper(ctx, paperId))?.updated_at.toISOString() ?? null;

  it('PU-30 no allocation: empty grid, zeroAllocation block, token null, totals 0 (NIGHT_SUBMITTED)', async () => {
    const s = await purchaseScene(ctx, { alloc: 0 });
    const b = await view(s.paperId);
    expect(b.purchases).toEqual([]);
    expect(b.zeroAllocation).toEqual({
      noAllocations: true,
      signedOffAt: null,
      signOffRequired: true,
    });
    expect(b.purchasePaperUpdatedAt).toBeNull();
    expect(b.totals).toEqual({
      estimatedTotalAmount: 0,
      persistedTotalAmount: 0,
    });
  });

  it('PU-31 allocations exist, nothing saved: one grid, rows only for vehicles with an allocation, prefilled cell, LIVE meta', async () => {
    const s = await purchaseScene(ctx);
    const b = await view(s.paperId);
    expect(b.purchases).toHaveLength(1);
    expect(b.purchases[0].distributor).toEqual({
      id: s.dist.id,
      name: s.dist.name,
    });
    expect(b.purchases[0].rows.map((r: any) => r.vehicleId)).toEqual([s.v1.id]);
    const c = cellOf(b, s.dist.id, s.v1.id, s.p.id)!;
    const alloc = (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!;
    expect(c.qty).toBe(10);
    expect(c.meta).toMatchObject({
      entryId: null,
      tracked: false,
      rateType: 'LIVE',
      rateStatus: 'OK',
      sourceAllocationId: alloc.id,
      sourceAllocatedQty: 10,
    });
  });

  it('PU-32 columns: Quantity / Rate / Amount per product; NON_MILK adds the Packaging Type level', async () => {
    const s = await purchaseScene(ctx, {
      products: [{}, { category: 'NON_MILK' as never }],
    });
    const [milk, nm] = s.products;
    const b = await view(s.paperId);
    const mg = b.purchases.find((g: any) => g.category === 'MILK');
    const ng = b.purchases.find((g: any) => g.category === 'NON_MILK');
    expect(leafFields(mg.columns)).toEqual([
      `product_${milk.id}`,
      `product_${milk.id}_rate`,
      `product_${milk.id}_amount`,
    ]);
    const mp = pathTo(mg.columns as ColumnNode[], `product_${milk.id}`)!;
    const np = pathTo(ng.columns as ColumnNode[], `product_${nm.id}`)!;
    expect(mp).toHaveLength(5);
    expect(np).toHaveLength(6);
    expect(np[3]).toBe(ctx.world.packName);
  });

  it('PU-33 a vehicle allocated in both sessions → two rows, one per session', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    const b = await view(t.paperId);
    const rows = b.purchases[0].rows.filter((r: any) => r.vehicleId === t.v.id);
    expect(rows.map((r: any) => r.deliverySession).sort()).toEqual([
      'MORNING',
      'NIGHT',
    ]);
  });

  it('PU-34 cell with no allocation and no entry: no meta, rate and amount 0, not editable in practice', async () => {
    const s = await purchaseScene(ctx, { products: [{}, {}], allocFor: [0] });
    const b = await view(s.paperId);
    const row = b.purchases[0].rows[0];
    const f = `product_${s.products[1].id}`;
    expect(row[`${f}_meta`]).toBeUndefined();
    expect(row[`${f}_rate`]).toBe(0);
    expect(row[`${f}_amount`]).toBe(0);
  });

  it('PU-35 saved entry: saved quantity, frozen rate, amount, FROZEN meta, snapshot, _stale false, variance block', async () => {
    const s = await purchaseScene(ctx);
    await saveOk(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    const c = cellOf(await view(s.paperId), s.dist.id, s.v1.id, s.p.id)!;
    const alloc = (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!;
    expect(c.qty).toBe(4);
    expect(c.rate).toBe(56);
    expect(c.amount).toBe(4 * 12 * 56);
    expect(c.meta).toMatchObject({
      tracked: true,
      rateType: 'FROZEN',
      snapshotAllocationId: alloc.id,
      snapshotAllocatedQty: 10,
      sourceAllocationId: alloc.id,
    });
    expect(c.stale).toBe(false);
    expect(c.variance).toMatchObject({
      allocatedQty: 10,
      purchasedQty: 4,
      status: 'SHORTFALL',
      signedVariancePercentage: -60,
      fulfillmentPercentage: 40,
    });
  });

  it('PU-36 unsaved cell default: live rate, amount = quantity x pricing quantity x rate', async () => {
    const s = await purchaseScene(ctx);
    const c = cellOf(await view(s.paperId), s.dist.id, s.v1.id, s.p.id)!;
    expect(c.rate).toBe(56);
    expect(c.amount).toBe(10 * 12 * 56);
  });

  describe('PU-37 rate validity on the IST gatepass day (seam: rate master data)', () => {
    const cases = [
      {
        name: 'a: effective from D 10:00 IST is valid',
        rates: (st: Date) => [
          { from: new Date(st.getTime() + 10 * HOUR), rate: 70 },
        ],
        want: 70,
      },
      {
        name: 'b: effective from next day 00:30 IST is not valid',
        rates: (st: Date) => [
          { from: new Date(st.getTime() + 24.5 * HOUR), rate: 70 },
        ],
        want: null,
      },
      {
        name: 'c: effective to previous day 23:59 IST is not valid',
        rates: (st: Date) => [
          {
            from: new Date('2000-01-01T00:00:00Z'),
            to: new Date(st.getTime() - 60_000),
            rate: 70,
          },
        ],
        want: null,
      },
      {
        name: 'd: effective to D 00:00 IST is valid',
        rates: (st: Date) => [
          { from: new Date('2000-01-01T00:00:00Z'), to: st, rate: 70 },
        ],
        want: 70,
      },
      {
        name: 'e: several valid, latest effective_from wins',
        rates: (st: Date) => [
          { from: new Date('2000-01-01T00:00:00Z'), rate: 50 },
          { from: new Date(st.getTime() - 2 * HOUR), rate: 65 },
        ],
        want: 65,
      },
    ];
    it.each(cases)('PU-37 $name', async ({ rates, want }) => {
      const s = await purchaseScene(ctx);
      await ctx.world.deleteRates(s.p);
      for (const r of rates(istStart(s.sheet.saleDate)))
        await ctx.world.addDistRate(s.p.links[s.dist.id], r.rate, {
          from: r.from,
          to: (r as any).to,
        });
      const c = cellOf(await view(s.paperId), s.dist.id, s.v1.id, s.p.id)!;
      if (want === null) {
        expect(c.rate).toBeNull();
        expect(c.meta.rateIssue).toBe('NO_RATE');
      } else {
        expect(c.rate).toBe(want);
      }
    });
  });

  it('PU-38 gatepass policy: SAME_DAY resolves the sale date, PREVIOUS_DAY the day before; the session does not change it', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    const st = istStart(t.sheet.saleDate);
    await ctx.world.deleteRates(t.p);
    const link = t.p.links[t.dist.id];
    await ctx.world.addDistRate(link, 40, {
      from: new Date('2000-01-01T00:00:00Z'),
      to: new Date(st.getTime() - 60_000),
    });
    await ctx.world.addDistRate(link, 60, {
      from: new Date(st.getTime() + HOUR),
    });
    const rateAt = async (session: string) =>
      cellOf(await view(t.paperId), t.dist.id, t.v.id, t.p.id, session)!.rate;
    expect(await rateAt('NIGHT')).toBe(60);
    expect(await rateAt('MORNING')).toBe(60);
    await ctx.db.master_brand.update({
      where: { id: ctx.world.brandPlain.id },
      data: { gatepass_date_policy: 'PREVIOUS_DAY' as never },
    });
    expect(await rateAt('NIGHT')).toBe(40);
    expect(await rateAt('MORNING')).toBe(40);
  });

  it('PU-39 unsaved cell with no active link / no valid rate / no order unit → 200, MISSING_CONFIGURATION, rate and amount null', async () => {
    // The rate is removed AFTER the order and the allocation exist: an order cannot be saved without a rate (OD-9.4).
    const s = await purchaseScene(ctx, { products: [{}, {}, {}] });
    const [p0, p1, p2] = s.products;
    await setLinksActive(ctx, p0.links, false);
    await ctx.world.deleteRates(p1);
    await breakOrderUnit(ctx, p2.id);
    const b = await view(s.paperId);
    for (const [p, issue] of [
      [p0, 'NO_ACTIVE_LINK'],
      [p1, 'NO_RATE'],
      [p2, 'NO_ORDER_UNIT'],
    ] as const) {
      const c = cellOf(b, s.dist.id, s.v1.id, p.id)!;
      expect(c.meta).toMatchObject({
        rateStatus: 'MISSING_CONFIGURATION',
        rateIssue: issue,
      });
      expect(c.rate).toBeNull();
      expect(c.amount).toBeNull();
    }
  });

  it('PU-40 totals: estimated (unsaved) and persisted (saved) are separate at row, grid and overall level; no totalAmount', async () => {
    const s = await purchaseScene(ctx, { alloc: 5 });
    await seedAlloc(ctx, s.paperId, [
      {
        vehicleId: s.v2.id,
        distributorId: s.dist.id,
        productId: s.p.id,
        qty: 5,
        snapshot: 10,
      },
    ]);
    await saveOk(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 5)],
      null,
    );
    const b = await view(s.paperId);
    const amt = 5 * 12 * 56;
    const g = b.purchases[0];
    const r1 = g.rows.find((r: any) => r.vehicleId === s.v1.id);
    const r2 = g.rows.find((r: any) => r.vehicleId === s.v2.id);
    expect([r1.estimatedTotalAmount, r1.persistedTotalAmount]).toEqual([
      0,
      amt,
    ]);
    expect([r2.estimatedTotalAmount, r2.persistedTotalAmount]).toEqual([
      amt,
      0,
    ]);
    expect(g.totals).toEqual({
      estimatedTotalAmount: amt,
      persistedTotalAmount: amt,
    });
    expect(b.totals).toEqual({
      estimatedTotalAmount: amt,
      persistedTotalAmount: amt,
    });
    expect(JSON.stringify(b)).not.toContain('"totalAmount"');
  });

  it('PU-41 / PU-186 allocation removed: entry is listed in orphanedEntries, not drawn; response persisted total includes it, grid totals do not', async () => {
    const s = await purchaseScene(ctx);
    await saveOk(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    const entry = (await puEntries(ctx, s.paperId))[0];
    await ctx.db.vehicle_allocation.delete({
      where: { id: (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id },
    });
    const b = await view(s.paperId);
    expect(b.orphanedEntries).toHaveLength(1);
    expect(b.orphanedEntries[0]).toMatchObject({
      entryId: entry.id,
      vehicleId: s.v1.id,
      distributorName: s.dist.name,
      purchasedQty: 4,
      purchaseRate: 56,
      purchaseAmount: 4 * 12 * 56,
    });
    expect(cellOf(b, s.dist.id, s.v1.id, s.p.id)).toBeNull();
    expect(
      b.purchases.reduce(
        (n: number, g: any) => n + g.totals.persistedTotalAmount,
        0,
      ),
    ).toBe(0);
    expect(b.totals.persistedTotalAmount).toBe(4 * 12 * 56);
    expect(b.hasStaleRows).toBe(false); // PD-68: an orphan is never also stale
  });

  it('PU-42 allocation quantity changed → _stale true and hasStaleRows; a legacy entry without any snapshot is never stale', async () => {
    const s = await purchaseScene(ctx);
    await saveOk(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    expect(
      cellOf(await view(s.paperId), s.dist.id, s.v1.id, s.p.id)!.stale,
    ).toBe(false);
    await setAllocQty(
      ctx,
      (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id,
      8,
    );
    let b = await view(s.paperId);
    expect(cellOf(b, s.dist.id, s.v1.id, s.p.id)!.stale).toBe(true);
    expect(b.hasStaleRows).toBe(true);
    await ctx.db.purchase_entry.updateMany({
      data: { source_allocation_id: null, source_allocated_qty: null },
      where: { vehicle_id: s.v1.id },
    });
    b = await view(s.paperId);
    expect(cellOf(b, s.dist.id, s.v1.id, s.p.id)!.stale).toBe(false);
    expect(b.hasStaleRows).toBe(false);
  });

  it('PU-185 allocation removed and re-added with the same quantity → the saved entry is not stale', async () => {
    const s = await purchaseScene(ctx);
    await saveOk(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 4)],
      null,
    );
    const old = (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!;
    await ctx.db.vehicle_allocation.delete({ where: { id: old.id } });
    await ctx.db.vehicle_allocation.create({
      data: {
        vehicle_allocation_paper_id: old.vehicle_allocation_paper_id,
        vehicle_id: old.vehicle_id,
        distributor_id: old.distributor_id,
        category: old.category,
        product_id: old.product_id,
        allocated_qty: old.allocated_qty,
        required_qty_at_save: old.required_qty_at_save,
      },
    });
    const b = await view(s.paperId);
    expect((await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id).not.toBe(
      old.id,
    );
    expect(cellOf(b, s.dist.id, s.v1.id, s.p.id)!.stale).toBe(false);
    expect(b.orphanedEntries).toEqual([]);
  });

  it('PU-43 variance: below → SHORTFALL, equal → MATCHED, allocation lowered afterwards → SURPLUS; fulfillment = purchased / allocated x 100', async () => {
    const s = await purchaseScene(ctx);
    let tok: string | null = null;
    for (const [q, status, pct] of [
      [4, 'SHORTFALL', 40],
      [10, 'MATCHED', 100],
    ] as const) {
      await saveOk(
        s.paperId,
        [await pe(ctx, s.paperId, s.v1, s.dist, s.p, q)],
        tok,
      );
      tok = await tokenOf(s.paperId);
      const v = cellOf(
        await view(s.paperId),
        s.dist.id,
        s.v1.id,
        s.p.id,
      )!.variance;
      expect(v).toMatchObject({ status, fulfillmentPercentage: pct });
    }
    await setAllocQty(
      ctx,
      (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id,
      8,
    );
    const v = cellOf(
      await view(s.paperId),
      s.dist.id,
      s.v1.id,
      s.p.id,
    )!.variance;
    expect(v).toMatchObject({
      status: 'SURPLUS',
      signedVariancePercentage: 25,
    });
  });

  it('PU-45 critical boundary: 21% below allocation warns; exactly 20% is HIGH with no warning', async () => {
    const s = await purchaseScene(ctx);
    const r1 = await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 7.9)],
      null,
    );
    expect(r1.body.shortfallWarnings).toHaveLength(1);
    let b = await view(s.paperId);
    expect(b.hasCriticalShortfall).toBe(true);
    expect(cellOf(b, s.dist.id, s.v1.id, s.p.id)!.variance).toMatchObject({
      severity: 'CRITICAL',
      shortfallWarning: true,
    });
    const r2 = await api.save(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 8)],
      await tokenOf(s.paperId),
    );
    expect(r2.body.shortfallWarnings).toEqual([]);
    b = await view(s.paperId);
    expect(b.hasCriticalShortfall).toBe(false);
    expect(cellOf(b, s.dist.id, s.v1.id, s.p.id)!.variance).toMatchObject({
      severity: 'HIGH',
      shortfallWarning: false,
    });
  });

  it('PU-46 confirmed zero against an allocation above 0 is tracked and reports a CRITICAL shortfall', async () => {
    const s = await purchaseScene(ctx);
    await saveOk(
      s.paperId,
      [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 0)],
      null,
    );
    const c = cellOf(await view(s.paperId), s.dist.id, s.v1.id, s.p.id)!;
    expect(c.meta.tracked).toBe(true);
    expect(c.variance).toMatchObject({
      purchasedQty: 0,
      severity: 'CRITICAL',
      shortfallWarning: true,
    });
  });

  it('PU-47 morningAllocationPending: true while MORNING demand exists without a MORNING allocation', async () => {
    const t = await twoSessionPurchaseScene(ctx, { morningAlloc: false });
    expect((await view(t.paperId)).morningAllocationPending).toBe(true);
    const r = await vaApi(ctx).save(
      t.paperId,
      [
        {
          vehicleId: t.v.id,
          distributorId: t.dist.id,
          category: 'MILK',
          productId: t.p.id,
          allocatedQty: t.qm,
        },
      ],
      null,
      { session: 'MORNING' },
    );
    expect(r.status, body(r)).toBe(200);
    expect((await view(t.paperId)).morningAllocationPending).toBe(false);
  });

  it('PU-48 taxExclusive true and gstApplied false', async () => {
    const s = await purchaseScene(ctx);
    const b = await view(s.paperId);
    expect([b.taxExclusive, b.gstApplied]).toEqual([true, false]);
  });

  it('PU-49 workflow.editable is true only in NIGHT_SUBMITTED and REOPENED', async () => {
    const s = await purchaseScene(ctx);
    for (const [status, want] of [
      ['DRAFT', false],
      ['NIGHT_SUBMITTED', true],
      ['MORNING_SUBMITTED', false],
      ['FINALIZED', false],
      ['REOPENED', true],
    ] as const) {
      await ctx.setStatus(s.sheet, status as never);
      expect((await view(s.paperId)).workflow, status).toMatchObject({
        status,
        editable: want,
      });
    }
  });

  it('PU-50 / PU-187 signOffRequired only when a sign-off can be recorded now; noAllocations is independent of status', async () => {
    const s = await purchaseScene(ctx, { alloc: 0, status: 'DRAFT' });
    for (const [status, want] of [
      ['DRAFT', false],
      ['NIGHT_SUBMITTED', true],
      ['MORNING_SUBMITTED', false],
      ['FINALIZED', false],
      ['REOPENED', true],
    ] as const) {
      await ctx.setStatus(s.sheet, status as never);
      expect((await view(s.paperId)).zeroAllocation, status).toMatchObject({
        noAllocations: true,
        signOffRequired: want,
      });
    }
  });

  it('PU-51 any GET is read-only: no header created, no token change', async () => {
    const s = await purchaseScene(ctx);
    await view(s.paperId);
    await view(s.paperId);
    expect(await puPaper(ctx, s.paperId)).toBeNull();
  });

  void [addDays];
});
