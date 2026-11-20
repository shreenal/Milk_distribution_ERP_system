/**
 * Vehicle Allocation – stale rows, anomaly lifecycle (Stale → Flagged → Reconciled), reconcile.
 * Scenarios: V-100 .. V-115, V-181   (spec: VA-6.x, VA-7.x, VA-9.5)
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
import {
  createOrdersTestContext,
  num,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addVehicle,
  al,
  cleanupVaTests,
  demandScene,
  seedAnomaly,
  setDemand,
  setLinksActive,
  setVehicleActive,
  vaAnomalies,
  vaApi,
  vaPaper,
  vaRows,
  vaToken,
} from '../../../../test/helper/vehicle-allocation-helpers.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';

describe('Vehicle Allocation anomalies and reconcile', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = vaApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const prep = async (o: Parameters<typeof demandScene>[1] = {}) => {
    const s = await demandScene(ctx, o);
    return { ...s, v1: await addVehicle(ctx), v2: await addVehicle(ctx) };
  };
  const tok = (paperId: number) => vaToken(ctx, paperId);
  const saveOk = async (paperId: number, entries: unknown[]) => {
    const r = await api.save(paperId, entries, await tok(paperId));
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };
  const reconcileOk = async (paperId: number) => {
    const r = await api.reconcile(paperId, await tok(paperId));
    expect(r.status, body(r)).toBe(200);
    return r.body;
  };

  it('V-100 save while an invalid row exists → row removed, one FLAGGED anomaly per cell, token advanced', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    await setVehicleActive(ctx, s.v1, false);
    const before = await tok(s.paperId);
    const out = await saveOk(s.paperId, [al(s.v2, s.dist, s.p, 6)]);
    expect(out).toMatchObject({
      changed: true,
      flaggedAnomalies: 1,
      reconciledAnomalies: 0,
    });
    expect((await vaRows(ctx, s.paperId)).map((r) => r.vehicle_id)).toEqual([
      s.v2.id,
    ]);
    const an = await vaAnomalies(ctx, s.paperId);
    expect(an).toHaveLength(1);
    expect(an[0]).toMatchObject({
      vehicle_id: s.v1.id,
      reason: 'VEHICLE_INACTIVE',
      status: 'FLAGGED',
    });
    expect(num(an[0].removed_qty)).toBe(4);
    expect(await tok(s.paperId)).not.toBe(before);
  });

  it('V-101 several reasons: VEHICLE_INACTIVE, else NOT_REQUIRED, else LINK_INACTIVE', async () => {
    const s = await prep({ products: [{}, {}] });
    const [p0, p1] = s.products;
    await saveOk(s.paperId, [al(s.v1, s.dist, p0, 3), al(s.v2, s.dist, p1, 3)]);
    await setVehicleActive(ctx, s.v1, false);
    await ctx.seedNight(s.sheet, [
      { clientId: s.c.id, productId: p0.id, orderedQty: 0 },
      { clientId: s.c.id, productId: p1.id, orderedQty: 0 },
    ]);
    await setLinksActive(ctx, p0.links, false);
    await setLinksActive(ctx, p1.links, false);
    await reconcileOk(s.paperId);
    const an = await vaAnomalies(ctx, s.paperId);
    expect(an.find((a) => a.product_id === p0.id)!.reason).toBe(
      'VEHICLE_INACTIVE',
    );
    expect(an.find((a) => a.product_id === p1.id)!.reason).toBe('NOT_REQUIRED');
  });

  it('V-102 a cell flagged in this transaction is not reconciled in it (even though its product is no longer required)', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 0);
    const out = await reconcileOk(s.paperId);
    expect(out).toMatchObject({
      changed: true,
      flaggedAnomalies: 1,
      reconciledAnomalies: 0,
    });
    expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('FLAGGED');
  });

  it('V-103 a LATER write that leaves the product no longer required, or fully allocated, reconciles the anomaly', async () => {
    // (a) no longer required
    const a = await prep();
    await saveOk(a.paperId, [al(a.v1, a.dist, a.p, 10)]);
    await setDemand(ctx, a.sheet, a.c, a.p, 0);
    await reconcileOk(a.paperId);
    const t1 = await tok(a.paperId);
    const second = await reconcileOk(a.paperId);
    expect(second).toMatchObject({
      changed: true,
      flaggedAnomalies: 0,
      reconciledAnomalies: 1,
    });
    const an = (await vaAnomalies(ctx, a.paperId))[0];
    expect(an.status).toBe('RECONCILED');
    expect(an.reconciled_at).not.toBeNull();
    expect(await tok(a.paperId)).not.toBe(t1);
    expect((await api.get(a.paperId)).body.anomalies).toEqual([]);
  });

  it('V-103b fully allocated again: first save flags, a later identical save reconciles', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setVehicleActive(ctx, s.v1, false);
    const first = await saveOk(s.paperId, [al(s.v2, s.dist, s.p, 10)]);
    expect(first).toMatchObject({
      flaggedAnomalies: 1,
      reconciledAnomalies: 0,
    });
    const second = await saveOk(s.paperId, [al(s.v2, s.dist, s.p, 10)]);
    expect(second).toMatchObject({ changed: true, reconciledAnomalies: 1 });
    expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('RECONCILED');
  });

  it('V-104 a later write that does not resolve it leaves the anomaly FLAGGED (no change)', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setVehicleActive(ctx, s.v1, false);
    await reconcileOk(s.paperId); // flagged, product 10 required, 0 allocated
    const t = await tok(s.paperId);
    const out = await reconcileOk(s.paperId);
    expect(out.changed).toBe(false);
    expect(await tok(s.paperId)).toBe(t);
    expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('FLAGGED');
  });

  it('V-105 reconcile in an editable session: invalid rows removed with evidence, valid quantities untouched, token returned', async () => {
    const s = await prep();
    await saveOk(s.paperId, [
      al(s.v1, s.dist, s.p, 4),
      al(s.v2, s.dist, s.p, 6),
    ]);
    await setVehicleActive(ctx, s.v1, false);
    const out = await reconcileOk(s.paperId);
    expect(out).toMatchObject({ changed: true, flaggedAnomalies: 1 });
    expect(out.vehicleAllocationPaperUpdatedAt).toBe(await tok(s.paperId));
    const rows = await vaRows(ctx, s.paperId);
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicle_id).toBe(s.v2.id);
    expect(num(rows[0].allocated_qty)).toBe(6);
  });

  it('V-106 reconcile with nothing to do → changed false, current token', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    const t = await tok(s.paperId);
    const out = await reconcileOk(s.paperId);
    expect(out).toMatchObject({
      changed: false,
      vehicleAllocationPaperUpdatedAt: t,
    });
    expect(await tok(s.paperId)).toBe(t);
  });

  it('V-107 reconcile with no allocation paper yet → changed false, token null; a non-null token is 409', async () => {
    const s = await prep();
    const ok = await api.reconcile(s.paperId, null);
    expect(ok.status, body(ok)).toBe(200);
    expect(ok.body).toMatchObject({
      changed: false,
      vehicleAllocationPaperUpdatedAt: null,
    });
    expect(
      (await api.reconcile(s.paperId, '2020-01-01T00:00:00.000Z')).status,
    ).toBe(409);
    expect(await vaPaper(ctx, s.paperId)).toBeNull();
  });

  it('V-108 reconcile in a locked session → 400 workflow message; RECONCILED evidence stays frozen', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    const paper = (await vaPaper(ctx, s.paperId))!;
    const seeded = await seedAnomaly(ctx, paper.id, {
      vehicleId: s.v2.id,
      distributorId: s.dist.id,
      productId: s.p.id,
      qty: 2,
      status: 'RECONCILED',
    });
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    const res = await api.reconcile(s.paperId, await tok(s.paperId));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('can no longer be edited');
    const after = await ctx.db.vehicle_allocation_anomaly.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(after).toMatchObject({ status: 'RECONCILED' });
    expect(after.updated_at.getTime()).toBe(seeded.updated_at.getTime());
  });

  it('V-109 reconcile does not touch a REQUIREMENT_CHANGED row; the condition remains until the planner saves', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 12);
    const out = await reconcileOk(s.paperId);
    expect(out.changed).toBe(false);
    const b = (await api.get(s.paperId)).body;
    expect(b.staleAllocations[0].kind).toBe('REQUIREMENT_CHANGED');
    expect(num((await vaRows(ctx, s.paperId))[0].allocated_qty)).toBe(10);
  });

  it('V-110 a cell with a RECONCILED anomaly that becomes invalid again reuses its single record (FLAGGED, reconciled_at cleared, new quantity)', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 0);
    await reconcileOk(s.paperId); // flagged
    await reconcileOk(s.paperId); // reconciled
    expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('RECONCILED');
    await setDemand(ctx, s.sheet, s.c, s.p, 5);
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 3)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 0);
    await reconcileOk(s.paperId);
    const an = await vaAnomalies(ctx, s.paperId);
    expect(an).toHaveLength(1);
    expect(an[0].status).toBe('FLAGGED');
    expect(an[0].reconciled_at).toBeNull();
    expect(num(an[0].removed_qty)).toBe(3);
  });

  describe('V-111 / V-181 a cell with a FLAGGED anomaly whose stored row is invalid again is flagged again and NOT reconciled in the same transaction', () => {
    const setup = async () => {
      const s = await prep();
      await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 5)]);
      const paper = (await vaPaper(ctx, s.paperId))!;
      // [DB seam] a FLAGGED record already exists for the very cell that holds the stored row
      await seedAnomaly(ctx, paper.id, {
        vehicleId: s.v1.id,
        distributorId: s.dist.id,
        productId: s.p.id,
        qty: 2,
        status: 'FLAGGED',
      });
      await setDemand(ctx, s.sheet, s.c, s.p, 0);
      return s;
    };

    it('V-111 via save', async () => {
      const s = await setup();
      const out = await saveOk(s.paperId, []);
      expect(out).toMatchObject({
        changed: true,
        flaggedAnomalies: 1,
        reconciledAnomalies: 0,
      });
      const an = await vaAnomalies(ctx, s.paperId);
      expect(an).toHaveLength(1);
      expect(an[0].status).toBe('FLAGGED');
      expect(num(an[0].removed_qty)).toBe(5);
    });

    it('V-181 via reconcile', async () => {
      const s = await setup();
      const out = await reconcileOk(s.paperId);
      expect(out).toMatchObject({
        changed: true,
        flaggedAnomalies: 1,
        reconciledAnomalies: 0,
      });
      expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('FLAGGED');
    });
  });

  it('V-112 RECONCILED anomalies are kept; removed only by cascade with the allocation paper', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 0);
    await reconcileOk(s.paperId);
    await reconcileOk(s.paperId);
    await reconcileOk(s.paperId); // nothing more to do
    expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('RECONCILED');
    const paperId = (await vaPaper(ctx, s.paperId))!.id;
    await ctx.db.order_paper.deleteMany({ where: { id: s.paperId } });
    expect(
      await ctx.db.vehicle_allocation_anomaly.count({
        where: { vehicle_allocation_paper_id: paperId },
      }),
    ).toBe(0);
  });

  it('V-113 link deactivated after a save: row removed with evidence; cannot be re-created until the link is reactivated', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 5)]);
    await setLinksActive(ctx, s.p.links, false);
    await reconcileOk(s.paperId);
    expect((await vaAnomalies(ctx, s.paperId))[0]).toMatchObject({
      reason: 'LINK_INACTIVE',
      status: 'FLAGGED',
    });
    expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
    const blocked = await api.save(
      s.paperId,
      [al(s.v1, s.dist, s.p, 5)],
      await tok(s.paperId),
    );
    expect(blocked.status).toBe(400);
    expect(JSON.stringify(blocked.body.details)).toContain(
      'does not have an active link',
    );
    await setLinksActive(ctx, s.p.links, true);
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 5)]);
  });

  it('V-114 [fault seam] save fails after flagging → evidence, rows and token rolled back', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    await setVehicleActive(ctx, s.v1, false);
    const t = await tok(s.paperId);
    vi.spyOn(
      VehicleAllocationRepository.prototype,
      'replaceVehicleAllocations',
    ).mockRejectedValueOnce(new Error('boom: secret'));
    const res = await api.save(s.paperId, [al(s.v2, s.dist, s.p, 6)], t);
    expect(res.status).toBe(500);
    expect(await vaAnomalies(ctx, s.paperId)).toHaveLength(0);
    expect(await tok(s.paperId)).toBe(t);
    expect((await vaRows(ctx, s.paperId)).map((r) => r.vehicle_id)).toEqual([
      s.v1.id,
    ]);
  });

  it('V-115 Orders lowers demand: detected live on the next view; no background cleanup', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    await setDemand(ctx, s.sheet, s.c, s.p, 0);
    const b = (await api.get(s.paperId)).body;
    expect(b.staleAllocations[0]).toMatchObject({
      kind: 'INVALID',
      reason: 'NOT_REQUIRED',
    });
    expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    expect(await vaAnomalies(ctx, s.paperId)).toHaveLength(0);
  });
});
