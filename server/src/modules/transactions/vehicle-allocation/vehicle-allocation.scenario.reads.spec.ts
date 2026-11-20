/**
 * Vehicle Allocation – grid view (GET /vehicle-allocations/:paperId/vehicle-allocations?session=).
 * Scenarios: V-20 .. V-38   (spec: VA-2.1, VA-3.x, VA-6.1, VA-7.6)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  leafFields,
  m,
  n,
  pathTo,
  type ColumnNode,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addVehicle,
  al,
  cellOf,
  cleanupVaTests,
  demandScene,
  gridOf,
  seedAlloc,
  seedAnomaly,
  setDemand,
  setLinksActive,
  setSheetSession,
  setVehicleActive,
  splitScene,
  twoSessionScene,
  vaApi,
  vaRows,
  vaToken,
  vname,
  type Session,
} from '../../../../test/helper/vehicle-allocation-helpers.js';

describe('Vehicle Allocation grid view', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = vaApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const view = async (paperId: number, session: Session = 'NIGHT') => {
    const r = await api.get(paperId, session);
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };
  const saveOk = async (
    paperId: number,
    entries: unknown[],
    session: Session = 'NIGHT',
  ) => {
    const r = await api.save(
      paperId,
      entries,
      await vaToken(ctx, paperId, session),
      { session },
    );
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };

  it('V-20 session with no positive demand: no grids, complete, ready, token null', async () => {
    const s = await ctx.world.scene({ products: [{}], clients: 1 });
    const b = await view(s.sheet.paperId);
    expect(b.allocations).toEqual([]);
    expect(b.completion).toEqual({ isComplete: true, lines: [] });
    expect(b.submission).toEqual({
      ready: true,
      coverageComplete: true,
      hasUnresolvedAnomalies: false,
      hasDistributorConflict: false,
    });
    expect(b.vehicleAllocationPaperUpdatedAt).toBeNull();
    expect(b.staleAllocations).toEqual([]);
    expect(b.anomalies).toEqual([]);
  });

  it('V-21 positive demand: one grid per distributor + category + brand, one row per active vehicle, totals = required', async () => {
    const s = await demandScene(ctx, { qty: 10 });
    const v = await addVehicle(ctx);
    const inactive = await addVehicle(ctx, { active: false });
    const b = await view(s.paperId);
    expect(b.allocations).toHaveLength(1);
    const grid = gridOf(b, s.dist.id);
    expect(grid.distributor).toEqual({ id: s.dist.id, name: s.dist.name });
    expect(grid.brand.id).toBe(ctx.world.brandPlain.id);
    expect(grid.totals[`product_${s.p.id}`]).toBe(10);
    expect(cellOf(grid, v.id, s.p.id)).toBe(0);
    expect(grid.rows.some((r: any) => r.vehicleId === inactive.id)).toBe(false);
  });

  it('V-22 a product whose total required quantity is 0 is not a column, total or coverage line', async () => {
    const s = await demandScene(ctx, { products: [{}, {}] });
    const [p0, p1] = s.products;
    await ctx.seedNight(s.sheet, [n(s.c, p1, 0)]);
    const b = await view(s.paperId);
    const grid = gridOf(b, s.dist.id);
    expect(leafFields(grid.columns)).toEqual([`product_${p0.id}`]);
    expect(Object.keys(grid.totals)).toEqual([`product_${p0.id}`]);
    expect(b.completion.lines.map((l: any) => l.productId)).toEqual([p0.id]);
  });

  it('V-23 demand that exists only in the other session is not shown', async () => {
    const s = await twoSessionScene(ctx, { qtyNight: 4, qtyMorning: 7 });
    const night = gridOf(await view(s.paperId, 'NIGHT'), s.dist.id);
    const morning = gridOf(await view(s.paperId, 'MORNING'), s.dist.id);
    expect(night.totals[`product_${s.p.id}`]).toBe(4);
    expect(morning.totals[`product_${s.p.id}`]).toBe(7);
  });

  it('V-24 the requirement uses ORDERED quantity, never delivered', async () => {
    const s = await demandScene(ctx, { qty: 10 });
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(s.sheet, [m(s.c, s.p, 3)]);
    expect(
      gridOf(await view(s.paperId), s.dist.id).totals[`product_${s.p.id}`],
    ).toBe(10);
  });

  it('V-25 same product, clients with different frozen suppliers → separate grids and required quantities', async () => {
    const s = await splitScene(ctx, { qtyA: 4, qtyB: 6 });
    const b = await view(s.paperId);
    expect(gridOf(b, s.A.id).totals[`product_${s.p.id}`]).toBe(4);
    expect(gridOf(b, s.B.id).totals[`product_${s.p.id}`]).toBe(6);
  });

  it('V-26 a product deactivated in master data but still ordered stays a column, counted, allocatable', async () => {
    const s = await demandScene(ctx, { qty: 10 });
    const v = await addVehicle(ctx);
    await ctx.db.master_product.update({
      where: { id: s.p.id },
      data: { is_active: false },
    });
    const b = await view(s.paperId);
    const grid = gridOf(b, s.dist.id);
    expect(leafFields(grid.columns)).toContain(`product_${s.p.id}`);
    expect(b.completion.lines.map((l: any) => l.productId)).toContain(s.p.id);
    await saveOk(s.paperId, [al(v, s.dist, s.p, 10)]);
    expect((await view(s.paperId)).completion.isComplete).toBe(true);
  });

  it('V-27 NON_MILK adds the Packaging Type level, MILK does not; fields are product_<id>', async () => {
    const s = await demandScene(ctx, {
      products: [{}, { category: 'NON_MILK' as never }],
    });
    const [milk, nonMilk] = s.products;
    const b = await view(s.paperId);
    const milkPath = pathTo(
      gridOf(b, s.dist.id, 'MILK').columns as ColumnNode[],
      `product_${milk.id}`,
    )!;
    const nmPath = pathTo(
      gridOf(b, s.dist.id, 'NON_MILK').columns as ColumnNode[],
      `product_${nonMilk.id}`,
    )!;
    expect(milkPath).toHaveLength(4);
    expect(milkPath[3]).toBe(`${milk.size}L`);
    expect(nmPath).toHaveLength(5);
    expect(nmPath[3]).toBe(ctx.world.packName);
  });

  it('V-28 vehicles: active only, by name ascending, nameless last, then id', async () => {
    const s = await demandScene(ctx);
    const sfx = ctx.world.sfx;
    const vb = await addVehicle(ctx, { name: `T-${sfx}-bb` });
    const va = await addVehicle(ctx, { name: `T-${sfx}-aa` });
    const vn = await addVehicle(ctx, { name: null });
    const off = await addVehicle(ctx, { name: `T-${sfx}-00`, active: false });
    const grid = gridOf(await view(s.paperId), s.dist.id);
    const mine = new Set([vb.id, va.id, vn.id, off.id]);
    const order = grid.rows
      .map((r: any) => r.vehicleId)
      .filter((id: number) => mine.has(id));
    expect(order).toEqual([va.id, vb.id, vn.id]);
  });

  it('V-29 a saved allocation for a valid row shows its quantity, otherwise 0', async () => {
    const s = await demandScene(ctx);
    const v1 = await addVehicle(ctx);
    const v2 = await addVehicle(ctx);
    await saveOk(s.paperId, [al(v1, s.dist, s.p, 6)]);
    const grid = gridOf(await view(s.paperId), s.dist.id);
    expect(cellOf(grid, v1.id, s.p.id)).toBe(6);
    expect(cellOf(grid, v2.id, s.p.id)).toBe(0);
  });

  describe('V-30 invalid stored rows are not drawn, are listed in staleAllocations and are not cleaned up by the view', () => {
    it('V-30a vehicle inactive', async () => {
      const s = await demandScene(ctx);
      const v = await addVehicle(ctx);
      await saveOk(s.paperId, [al(v, s.dist, s.p, 4)]);
      await setVehicleActive(ctx, v, false);
      const b = await view(s.paperId);
      expect(b.staleAllocations).toHaveLength(1);
      expect(b.staleAllocations[0]).toMatchObject({
        kind: 'INVALID',
        reason: 'VEHICLE_INACTIVE',
        vehicleId: v.id,
        allocatedQty: 4,
      });
      expect(b.staleAllocations[0].message).toContain(vname(v));
      expect(b.staleAllocations[0].message).toContain(s.dist.name);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    });

    it('V-30b product no longer required (demand dropped to 0)', async () => {
      const s = await demandScene(ctx);
      const v = await addVehicle(ctx);
      await saveOk(s.paperId, [al(v, s.dist, s.p, 4)]);
      await setDemand(ctx, s.sheet, s.c, s.p, 0);
      const b = await view(s.paperId);
      expect(b.allocations).toEqual([]);
      expect(b.staleAllocations[0]).toMatchObject({
        kind: 'INVALID',
        reason: 'NOT_REQUIRED',
      });
      expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    });

    it('V-30c link no longer active (the cell is drawn as 0)', async () => {
      const s = await demandScene(ctx);
      const v = await addVehicle(ctx);
      await saveOk(s.paperId, [al(v, s.dist, s.p, 4)]);
      await setLinksActive(ctx, s.p.links, false);
      const b = await view(s.paperId);
      expect(b.staleAllocations[0]).toMatchObject({
        kind: 'INVALID',
        reason: 'LINK_INACTIVE',
      });
      expect(cellOf(gridOf(b, s.dist.id), v.id, s.p.id)).toBe(0);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    });
  });

  it('V-31 snapshot differs from the current requirement → still drawn, listed as REQUIREMENT_CHANGED', async () => {
    const s = await demandScene(ctx, { qty: 10 });
    const v = await addVehicle(ctx);
    await saveOk(s.paperId, [al(v, s.dist, s.p, 10)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 12);
    const b = await view(s.paperId);
    expect(b.staleAllocations).toHaveLength(1);
    expect(b.staleAllocations[0]).toMatchObject({
      kind: 'REQUIREMENT_CHANGED',
      reason: 'REQUIREMENT_CHANGED',
      allocatedQty: 10,
    });
    expect(b.staleAllocations[0].message).toContain('from 10 to 12');
    expect(cellOf(gridOf(b, s.dist.id), v.id, s.p.id)).toBe(10);
  });

  it('V-32 a legacy row without a snapshot is never judged stale', async () => {
    const s = await demandScene(ctx, { qty: 10 });
    const v = await addVehicle(ctx);
    await saveOk(s.paperId, [al(v, s.dist, s.p, 10)]);
    await ctx.db.vehicle_allocation.updateMany({
      data: { required_qty_at_save: null },
      where: { vehicle_id: v.id },
    });
    await setDemand(ctx, s.sheet, s.c, s.p, 12);
    expect((await view(s.paperId)).staleAllocations).toEqual([]);
  });

  it('V-33 only FLAGGED anomalies are listed (with removed quantity and flaggedAt); RECONCILED are not', async () => {
    const s = await demandScene(ctx);
    const v1 = await addVehicle(ctx);
    const v2 = await addVehicle(ctx);
    const paper = await seedAlloc(ctx, s.paperId, []);
    await seedAnomaly(ctx, paper.id, {
      vehicleId: v1.id,
      distributorId: s.dist.id,
      productId: s.p.id,
      qty: 3,
      status: 'FLAGGED',
    });
    await seedAnomaly(ctx, paper.id, {
      vehicleId: v2.id,
      distributorId: s.dist.id,
      productId: s.p.id,
      qty: 5,
      status: 'RECONCILED',
    });
    const b = await view(s.paperId);
    expect(b.anomalies).toHaveLength(1);
    expect(b.anomalies[0]).toMatchObject({
      vehicleId: v1.id,
      removedQty: 3,
      reason: 'NOT_REQUIRED',
    });
    expect(typeof b.anomalies[0].flaggedAt).toBe('string');
    expect(b.anomalies[0].message).toContain(vname(v1));
  });

  describe('V-34 submission block', () => {
    it('V-34a not covered → not ready; fully allocated → ready', async () => {
      const s = await demandScene(ctx);
      const v = await addVehicle(ctx);
      expect((await view(s.paperId)).submission).toEqual({
        ready: false,
        coverageComplete: false,
        hasUnresolvedAnomalies: false,
        hasDistributorConflict: false,
      });
      await saveOk(s.paperId, [al(v, s.dist, s.p, 10)]);
      expect((await view(s.paperId)).submission.ready).toBe(true);
    });

    it('V-34b unresolved stale row → hasUnresolvedAnomalies, not ready', async () => {
      const s = await demandScene(ctx);
      const v = await addVehicle(ctx);
      await saveOk(s.paperId, [al(v, s.dist, s.p, 10)]);
      await setDemand(ctx, s.sheet, s.c, s.p, 12);
      expect((await view(s.paperId)).submission).toMatchObject({
        ready: false,
        hasUnresolvedAnomalies: true,
      });
    });

    it('V-34c [DB seam] a vehicle with one category from two distributors → hasDistributorConflict, not ready', async () => {
      const s = await splitScene(ctx, { qtyA: 4, qtyB: 6 });
      const v = await addVehicle(ctx);
      await seedAlloc(ctx, s.paperId, [
        {
          vehicleId: v.id,
          distributorId: s.A.id,
          productId: s.p.id,
          qty: 4,
          snapshot: 4,
        },
        {
          vehicleId: v.id,
          distributorId: s.B.id,
          productId: s.p.id,
          qty: 6,
          snapshot: 6,
        },
      ]);
      expect((await view(s.paperId)).submission).toEqual({
        ready: false,
        coverageComplete: true,
        hasUnresolvedAnomalies: false,
        hasDistributorConflict: true,
      });
    });
  });

  it('V-35 any GET is read-only: no write, no token change, no cleanup', async () => {
    const s = await demandScene(ctx);
    const v = await addVehicle(ctx);
    await saveOk(s.paperId, [al(v, s.dist, s.p, 4)]);
    await setVehicleActive(ctx, v, false);
    const tok = await vaToken(ctx, s.paperId);
    await view(s.paperId);
    await view(s.paperId);
    expect(await vaToken(ctx, s.paperId)).toBe(tok);
    expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    expect(
      await ctx.db.vehicle_allocation_anomaly.count({
        where: { vehicle_id: v.id },
      }),
    ).toBe(0);
  });

  it('V-36 workflow.editable per status and session (DRAFT: both; NIGHT_SUBMITTED: MORNING only)', async () => {
    const s = await demandScene(ctx);
    const matrix: [string, boolean, boolean][] = [
      ['DRAFT', true, true],
      ['NIGHT_SUBMITTED', false, true],
    ];
    for (const [status, night, morning] of matrix) {
      await ctx.setStatus(s.sheet, status as never);
      const n1 = await view(s.paperId, 'NIGHT');
      const m1 = await view(s.paperId, 'MORNING');
      expect(n1.workflow, status).toMatchObject({ status, editable: night });
      expect(m1.workflow, status).toMatchObject({ status, editable: morning });
    }
  });

  it('V-37 groupSummaries: by brand, filtered to the requested session', async () => {
    const s = await twoSessionScene(ctx, { qtyNight: 4, qtyMorning: 7 });
    const brandId = ctx.world.brandPlain.id;
    const night = (await view(s.paperId, 'NIGHT')).groupSummaries[brandId];
    const morning = (await view(s.paperId, 'MORNING')).groupSummaries[brandId];
    expect(night.rows.map((r: any) => r.groupId)).toEqual([s.group.id]);
    expect(night.rows[0][`product_${s.p.id}`]).toBe(4);
    expect(morning.rows.map((r: any) => r.groupId)).toEqual([
      s.sheet2.group.id,
    ]);
    expect(morning.rows[0][`product_${s.p.id}`]).toBe(7);
  });

  it('V-38 view works in MORNING_SUBMITTED, FINALIZED, REOPENED with editable false', async () => {
    const s = await demandScene(ctx);
    for (const status of [
      'MORNING_SUBMITTED',
      'FINALIZED',
      'REOPENED',
    ] as const) {
      await ctx.setStatus(s.sheet, status);
      for (const session of ['NIGHT', 'MORNING'] as const) {
        const b = await view(s.paperId, session);
        expect(b.workflow, `${status}/${session}`).toMatchObject({
          status,
          editable: false,
        });
      }
    }
  });
});
