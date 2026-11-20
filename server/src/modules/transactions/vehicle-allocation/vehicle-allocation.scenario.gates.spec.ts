/**
 * Vehicle Allocation – submission gates called by Paper.
 * Scenarios: V-120 .. V-127, V-130, V-180   (spec: VA-2.2, VA-3.5, VA-7.3, VA-7.5, VA-8.x)
 * V-128 / V-129 live in vehicle-allocation.scenario.paper.spec.ts (they need the Paper module).
 *
 * The gates are not HTTP endpoints of this module; Paper calls them on submit. They are exercised through
 * VehicleAllocationValidationService against the real test database (same approach as the Orders gates spec).
 * V-126 is adapted: a real night submit needs every other module to be ready, so the NIGHT_SUBMITTED status is set directly.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
  seedAlloc,
  setDemand,
  setLinksActive,
  setVehicleActive,
  splitScene,
  twoSessionScene,
  vaAnomalies,
  vaApi,
  vaRows,
  vaToken,
} from '../../../../test/helper/vehicle-allocation-helpers.js';
import { VehicleAllocationValidationService } from './services/vehicle-allocation-validation.service.js';

describe('Vehicle Allocation submission gates', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  let gates: VehicleAllocationValidationService;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = vaApi(ctx);
    gates = ctx.app.get(VehicleAllocationValidationService, { strict: false });
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const db = () => ctx.prisma as never;
  const night = (paperId: number) =>
    gates.validateVehicleAllocationsForNightSubmit(paperId, db());
  const morning = (paperId: number) =>
    gates.validateVehicleAllocationsForMorningSubmit(paperId, db());
  /** The 400 body of a rejected gate, or null when it passed. */
  const rejection = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      expect(e.getStatus?.(), String(e)).toBe(400);
      return e.getResponse() as {
        message: string;
        coverage: string[];
        integrity: string[];
        details: string[];
      };
    }
    return null;
  };
  const prep = async (o: Parameters<typeof demandScene>[1] = {}) => {
    const s = await demandScene(ctx, o);
    return { ...s, v1: await addVehicle(ctx), v2: await addVehicle(ctx) };
  };
  const saveOk = async (
    paperId: number,
    entries: unknown[],
    session: 'NIGHT' | 'MORNING' = 'NIGHT',
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

  it('V-120 every positive-demand product allocated exactly, nothing stale → the gate passes', async () => {
    const s = await prep({ qty: 10 });
    await saveOk(s.paperId, [
      al(s.v1, s.dist, s.p, 6),
      al(s.v2, s.dist, s.p, 4),
    ]);
    await expect(night(s.paperId)).resolves.toBeUndefined();
  });

  it('V-121 under- or over-allocation → 400 coverage[] naming distributor, category, product, required and allocated', async () => {
    const s = await prep({ qty: 10 });
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    let r = await rejection(() => night(s.paperId));
    expect(r!.message).toBe(
      'Vehicle allocation for the NIGHT session is not ready for submission',
    );
    expect(r!.coverage).toHaveLength(1);
    expect(r!.coverage[0]).toContain(s.dist.name);
    expect(r!.coverage[0]).toContain('(MILK)');
    expect(r!.coverage[0]).toContain('required 10, allocated 4');
    expect(r!.integrity).toEqual([]);
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 15)]);
    r = await rejection(() => night(s.paperId));
    expect(r!.coverage[0]).toContain('required 10, allocated 15');
  });

  it('V-122 session with no positive demand and an empty allocation → passes', async () => {
    const s = await ctx.world.scene({ products: [{}], clients: 1 });
    await expect(night(s.sheet.paperId)).resolves.toBeUndefined();
    await expect(morning(s.sheet.paperId)).resolves.toBeUndefined();
  });

  describe('V-123 data integrity: invalid, stale, FLAGGED, distributor split → 400 integrity[]', () => {
    it('V-123a invalid stored row', async () => {
      const s = await prep();
      await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
      await setVehicleActive(ctx, s.v1, false);
      const r = await rejection(() => night(s.paperId));
      expect(
        r!.integrity.some((m) => m.includes('the vehicle is no longer active')),
      ).toBe(true);
    });

    it('V-123b stale (requirement changed since save)', async () => {
      const s = await prep();
      await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
      await setDemand(ctx, s.sheet, s.c, s.p, 12);
      const r = await rejection(() => night(s.paperId));
      expect(
        r!.integrity.some((m) =>
          m.includes('required quantity changed from 10 to 12'),
        ),
      ).toBe(true);
    });

    it('V-123c unresolved FLAGGED anomaly is listed with "It is still unresolved"', async () => {
      const s = await prep();
      await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
      await setVehicleActive(ctx, s.v1, false);
      await api.reconcile(s.paperId, await vaToken(ctx, s.paperId));
      expect((await vaAnomalies(ctx, s.paperId))[0].status).toBe('FLAGGED');
      const r = await rejection(() => night(s.paperId));
      expect(
        r!.integrity.some((m) => m.includes('It is still unresolved')),
      ).toBe(true);
    });

    it('V-123d [DB seam] one vehicle takes a category from two distributors', async () => {
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
      const r = await rejection(() => night(s.paperId));
      expect(r!.coverage).toEqual([]);
      expect(r!.integrity).toHaveLength(1);
      for (const part of ['MILK', s.A.name, s.B.name])
        expect(r!.integrity[0]).toContain(part);
    });
  });

  it('V-124 coverage and integrity both failing → one 400 carrying both lists and details', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 4)]);
    await setVehicleActive(ctx, s.v1, false);
    const r = await rejection(() => night(s.paperId));
    expect(r!.coverage.length).toBeGreaterThan(0);
    expect(r!.integrity.length).toBeGreaterThan(0);
    expect(r!.details).toEqual([...r!.coverage, ...r!.integrity]);
  });

  it('V-125 night submit checks NIGHT only; morning submit checks MORNING only', async () => {
    const s = await twoSessionScene(ctx, { qtyNight: 4, qtyMorning: 7 });
    const v = await addVehicle(ctx);
    await saveOk(s.paperId, [al(v, s.dist, s.p, 4)], 'NIGHT');
    await expect(night(s.paperId)).resolves.toBeUndefined();
    const r = await rejection(() => morning(s.paperId));
    expect(r!.message).toBe(
      'Vehicle allocation for the MORNING session is not ready for submission',
    );
    expect(r!.coverage[0]).toContain('required 7, allocated 0');
    await saveOk(s.paperId, [al(v, s.dist, s.p, 7)], 'MORNING');
    await expect(morning(s.paperId)).resolves.toBeUndefined();
  });

  it('V-126 [adapted] a MORNING plan saved in DRAFT survives the NIGHT lock untouched and stays editable', async () => {
    const s = await twoSessionScene(ctx, { qtyNight: 4, qtyMorning: 7 });
    const v = await addVehicle(ctx);
    await saveOk(s.paperId, [al(v, s.dist, s.p, 4)], 'NIGHT');
    await saveOk(s.paperId, [al(v, s.dist, s.p, 7)], 'MORNING');
    const before = (await vaRows(ctx, s.paperId, 'MORNING'))[0];
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED'); // stands in for the real night submit
    const after = (await vaRows(ctx, s.paperId, 'MORNING'))[0];
    expect(num(after.allocated_qty)).toBe(7);
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
    expect((await api.get(s.paperId, 'MORNING')).body.workflow.editable).toBe(
      true,
    );
    expect((await api.get(s.paperId, 'NIGHT')).body.workflow.editable).toBe(
      false,
    );
    const edit = await api.save(
      s.paperId,
      [al(v, s.dist, s.p, 6)],
      await vaToken(ctx, s.paperId, 'MORNING'),
      { session: 'MORNING' },
    );
    expect(edit.status, body(edit)).toBe(200);
    const locked = await api.save(
      s.paperId,
      [al(v, s.dist, s.p, 3)],
      await vaToken(ctx, s.paperId),
      { session: 'NIGHT' },
    );
    expect(locked.status).toBe(400);
  });

  it('V-127 a FLAGGED anomaly whose product is already covered still blocks until another write', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setVehicleActive(ctx, s.v1, false);
    await saveOk(s.paperId, [al(s.v2, s.dist, s.p, 10)]); // flags v1's row, covers the product
    const r = await rejection(() => night(s.paperId));
    expect(r!.coverage).toEqual([]);
    expect(r!.integrity.some((m) => m.includes('It is still unresolved'))).toBe(
      true,
    );
    await saveOk(s.paperId, [al(s.v2, s.dist, s.p, 10)]); // later write reconciles
    await expect(night(s.paperId)).resolves.toBeUndefined();
  });

  it('V-130 the gate never cleans up: invalid rows are reported, not removed', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setVehicleActive(ctx, s.v1, false);
    const tok = await vaToken(ctx, s.paperId);
    await rejection(() => night(s.paperId));
    expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    expect(await vaAnomalies(ctx, s.paperId)).toHaveLength(0);
    expect(await vaToken(ctx, s.paperId)).toBe(tok);
  });

  it('V-180 LINK_INACTIVE row on an active vehicle: coverage counts it as 0 (same as the view); integrity lists the row', async () => {
    const s = await prep();
    await saveOk(s.paperId, [al(s.v1, s.dist, s.p, 10)]);
    await setLinksActive(ctx, s.p.links, false);
    const r = await rejection(() => night(s.paperId));
    expect(r!.coverage[0]).toContain('required 10, allocated 0');
    expect(
      r!.integrity.some((m) => m.includes('no longer has an active link')),
    ).toBe(true);
    const line = (await api.get(s.paperId)).body.completion.lines[0];
    expect(line).toMatchObject({
      requiredQty: 10,
      allocatedQty: 0,
      isComplete: false,
    });
  });
});
