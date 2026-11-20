/**
 * Vehicle Allocation – concurrency, retry, failure handling, cross-module effects.
 * Scenarios: V-140 .. V-142, V-144 .. V-149, V-161 .. V-165   (V-143 is in the paper spec; V-150 and V-160 are not implemented)
 * (spec: VA-5.2, VA-9.x, VA-6.6, VA-5.14, PA-17.4)
 *
 * V-142 / V-145 / V-146 inject a fault through a repository spy (same technique as the Orders / Client Trays suites):
 * the real condition cannot be produced deterministically through HTTP.
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
  m,
  n,
  num,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  RETRY_MSG,
  STALE_VA,
  TIMEOUT_MSG,
  addVehicle,
  al,
  cleanupVaTests,
  demandScene,
  gridOf,
  vaApi,
  vaPaper,
  vaRows,
  vaToken,
} from '../../../../test/helper/vehicle-allocation-helpers.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';

describe('Vehicle Allocation concurrency, failure handling and cross-module effects', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = vaApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const is2xx = (s: number) => s >= 200 && s < 300;
  const prep = async (o: Parameters<typeof demandScene>[1] = {}) => {
    const s = await demandScene(ctx, o);
    return { ...s, v1: await addVehicle(ctx), v2: await addVehicle(ctx) };
  };
  const tok = (paperId: number) => vaToken(ctx, paperId);
  const qtyOf = async (paperId: number) =>
    num((await vaRows(ctx, paperId))[0].allocated_qty);

  it('V-140 two users save the same session with the same token → exactly one succeeds, the other 409; one write', async () => {
    const s = await prep();
    expect(
      (await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], null)).status,
    ).toBe(200);
    const t = await tok(s.paperId);
    const [r1, r2] = await Promise.all([
      api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], t, {
        token: ctx.tokens.emp,
      }),
      api.save(s.paperId, [al(s.v1, s.dist, s.p, 3)], t, {
        token: ctx.tokens.emp2,
      }),
    ]);
    const winners = [r1, r2].filter((r) => is2xx(r.status));
    const losers = [r1, r2].filter((r) => r.status === 409);
    expect(
      winners,
      `${r1.status}/${r2.status} ${body(r1)} ${body(r2)}`,
    ).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect([STALE_VA, RETRY_MSG]).toContain(losers[0].body.message);
    expect(await qtyOf(s.paperId)).toBe(winners[0] === r1 ? 2 : 3);
    expect(await tok(s.paperId)).toBe(
      winners[0].body.vehicleAllocationPaperUpdatedAt,
    );
    expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
  });

  it('V-141 two concurrent FIRST saves → one succeeds, the other 409; one header', async () => {
    const s = await prep();
    const [r1, r2] = await Promise.all([
      api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null, {
        token: ctx.tokens.emp,
      }),
      api.save(s.paperId, [al(s.v1, s.dist, s.p, 3)], null, {
        token: ctx.tokens.emp2,
      }),
    ]);
    expect(
      [r1, r2].filter((r) => is2xx(r.status)),
      `${body(r1)} ${body(r2)}`,
    ).toHaveLength(1);
    expect([r1, r2].filter((r) => r.status === 409)).toHaveLength(1);
    expect(
      await ctx.db.vehicle_allocation_paper.count({
        where: { order_paper_id: s.paperId },
      }),
    ).toBe(1);
    expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
  });

  it('V-142 [fault seam] serialization conflicts exhaust 3 attempts → 409 "conflicted with another update"; rolled back', async () => {
    const s = await prep();
    const spy = vi
      .spyOn(VehicleAllocationRepository.prototype, 'replaceVehicleAllocations')
      .mockRejectedValue(
        Object.assign(new Error('Write conflict'), { code: 'P2034' }),
      );
    const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null);
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(RETRY_MSG);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(await vaPaper(ctx, s.paperId)).toBeNull();
  });

  it('V-144 Orders lowers demand between GET and save: the token is unchanged by Orders, the save validates on the live requirement', async () => {
    const s = await prep();
    await api.save(s.paperId, [al(s.v1, s.dist, s.p, 5)], null);
    const loaded = (await api.get(s.paperId)).body
      .vehicleAllocationPaperUpdatedAt;
    await ctx.seedNight(s.sheet, [n(s.c, s.p, 0)]); // user B (Orders)
    expect(await tok(s.paperId)).toBe(loaded);
    const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 5)], loaded);
    expect(res.status, body(res)).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain('is not required');
  });

  it('V-145 [fault seam] transaction timeout → 409 "took too long and nothing was saved"; nothing saved', async () => {
    const s = await prep();
    vi.spyOn(
      VehicleAllocationRepository.prototype,
      'replaceVehicleAllocations',
    ).mockRejectedValueOnce(
      Object.assign(new Error('Transaction already closed'), { code: 'P2028' }),
    );
    const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null);
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(TIMEOUT_MSG);
    expect(await vaPaper(ctx, s.paperId)).toBeNull();
  });

  it('V-146 [fault seam] unexpected exception after the token was touched → masked 500 with requestId; everything rolled back', async () => {
    const s = await prep();
    vi.spyOn(
      VehicleAllocationRepository.prototype,
      'replaceVehicleAllocations',
    ).mockRejectedValueOnce(new Error('boom: secret connection string'));
    const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).not.toBe('unknown');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(await vaPaper(ctx, s.paperId)).toBeNull();
    expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
  });

  it('V-147 lost response: retry with the old token → 409 although the data was saved; the same payload with the NEW token is a no-op', async () => {
    const s = await prep();
    const saved = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null); // response "lost"
    expect(saved.status, body(saved)).toBe(200);
    const retry = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe(STALE_VA);
    const fresh = await api.save(
      s.paperId,
      [al(s.v1, s.dist, s.p, 2)],
      await tok(s.paperId),
    );
    expect(fresh.body.changed).toBe(false);
    expect(await qtyOf(s.paperId)).toBe(2);
  });

  it('V-148 double click: same payload and token twice → first succeeds, second 409; one write', async () => {
    const s = await prep();
    const first = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
    expect(is2xx(first.status), body(first)).toBe(true);
    const second = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
    expect(second.status).toBe(409);
    expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
  });

  it('V-149 a foreign-key failure (unknown vehicle) is a 400, never a 500', async () => {
    const s = await prep();
    const res = await api.save(
      s.paperId,
      [al({ id: 2000000000 }, s.dist, s.p, 5)],
      null,
    );
    expect(res.status, body(res)).toBe(400);
  });

  it.todo(
    'V-150 save with 5000 entries on a large real paper finishes inside the 10 s transaction (VA-13.2: measure before go-live; not testable deterministically)',
  );

  // ------------------------------------------------------------------ cross-module
  it('V-161 a save that only refreshes the snapshot keeps the allocation row id and quantity', async () => {
    const s = await prep({ qty: 10 });
    await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
    const before = (await vaRows(ctx, s.paperId))[0];
    await ctx.seedNight(s.sheet, [n(s.c, s.p, 12)]);
    const res = await api.save(
      s.paperId,
      [al(s.v1, s.dist, s.p, 4)],
      await tok(s.paperId),
    );
    expect(res.body.changed).toBe(true);
    const after = (await vaRows(ctx, s.paperId))[0];
    expect(after.id).toBe(before.id);
    expect(num(after.allocated_qty)).toBe(4);
    expect(num(after.required_qty_at_save)).toBe(12);
  });

  it('V-162 a line created in the morning (ordered 0) adds no demand', async () => {
    const s = await ctx.world.scene({ clients: 2 });
    const [c1, c2] = s.clients;
    const [p] = s.products;
    await ctx.seedNight(s.sheet, [n(c1, p, 6)]);
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(s.sheet, [m(c2, p, 3)]);
    const grid = gridOf(
      (await api.get(s.sheet.paperId)).body,
      ctx.world.distA.id,
    );
    expect(grid.totals[`product_${p.id}`]).toBe(6);
  });

  it('V-163 a cancelled or lowered order shrinks demand; rows may become stale or NOT_REQUIRED', async () => {
    const s = await ctx.world.scene({ clients: 2 });
    const [c1, c2] = s.clients;
    const [p] = s.products;
    const v = await addVehicle(ctx);
    await ctx.seedNight(s.sheet, [n(c1, p, 6), n(c2, p, 4)]);
    await api.save(s.sheet.paperId, [al(v, ctx.world.distA, p, 10)], null);
    await ctx.seedNight(s.sheet, [n(c1, p, 0)]);
    let b = (await api.get(s.sheet.paperId)).body;
    expect(gridOf(b, ctx.world.distA.id).totals[`product_${p.id}`]).toBe(4);
    expect(b.staleAllocations[0].kind).toBe('REQUIREMENT_CHANGED');
    await ctx.seedNight(s.sheet, [n(c2, p, 0)]);
    b = (await api.get(s.sheet.paperId)).body;
    expect(b.staleAllocations[0]).toMatchObject({
      kind: 'INVALID',
      reason: 'NOT_REQUIRED',
    });
  });

  it('V-164 a sheet marked no-operation that still carries orders still counts as demand', async () => {
    const s = await prep({ qty: 10 });
    await ctx.db.order_sheet.update({
      where: { id: s.sheet.sheetId },
      data: { no_operation: true },
    });
    expect(
      gridOf((await api.get(s.paperId)).body, s.dist.id).totals[
        `product_${s.p.id}`
      ],
    ).toBe(10);
  });

  it('V-165 a group delivery_session change after paper generation does not move the existing sheet', async () => {
    const s = await prep({ qty: 10 });
    await ctx.db.master_group.update({
      where: { id: s.group.id },
      data: { delivery_session: 'MORNING' },
    });
    expect(
      gridOf((await api.get(s.paperId, 'NIGHT')).body, s.dist.id).totals[
        `product_${s.p.id}`
      ],
    ).toBe(10);
    expect((await api.get(s.paperId, 'MORNING')).body.allocations).toEqual([]);
  });
});
