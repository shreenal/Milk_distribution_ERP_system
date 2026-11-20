/**
 * Vehicle Allocation – save: request validation, token, business rules, no-op, deletions.
 * Scenarios: V-40 .. V-56, V-60 .. V-82, V-90 .. V-96, V-182, V-183
 * (spec: VA-2.x, VA-4.x, VA-5.x, VA-9.2, VA-10)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  n,
  num,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  DROPPED_MSG,
  STALE_VA,
  addVehicle,
  al,
  cleanupVaTests,
  demandScene,
  gridOf,
  setDemand,
  setLinksActive,
  setSheetSession,
  setVehicleActive,
  splitScene,
  twoSessionScene,
  vaApi,
  vaPaper,
  vaRows,
  vaToken,
  vname,
} from '../../../../test/helper/vehicle-allocation-helpers.js';

describe('Vehicle Allocation save', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = vaApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const MISSING = 2000000000;
  const base = async (o: Parameters<typeof demandScene>[1] = {}) => {
    const s = await demandScene(ctx, o);
    const v1 = await addVehicle(ctx);
    const v2 = await addVehicle(ctx);
    return { ...s, v1, v2 };
  };
  const tokenOf = (paperId: number, session: 'NIGHT' | 'MORNING' = 'NIGHT') =>
    vaToken(ctx, paperId, session);

  // ------------------------------------------------------------------ C3
  describe('request validation and token', () => {
    it('V-40 first save with explicit null token → 200 changed, header created, row + snapshot stored', async () => {
      const s = await base();
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      expect(res.status, body(res)).toBe(200);
      expect(res.body).toMatchObject({ success: true, changed: true });
      const paper = await vaPaper(ctx, s.paperId);
      expect(res.body.vehicleAllocationPaperUpdatedAt).toBe(
        paper!.updated_at.toISOString(),
      );
      const rows = await vaRows(ctx, s.paperId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        vehicle_id: s.v1.id,
        distributor_id: s.dist.id,
        product_id: s.p.id,
        category: 'MILK',
      });
      expect(num(rows[0].allocated_qty)).toBe(4);
      expect(num(rows[0].required_qty_at_save)).toBe(10);
    });

    it('V-41 expectedUpdatedAt omitted → 400 on save and on reconcile', async () => {
      const s = await base();
      expect(
        (await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], undefined))
          .status,
      ).toBe(400);
      expect((await api.reconcile(s.paperId, undefined)).status).toBe(400);
      expect(await vaPaper(ctx, s.paperId)).toBeNull();
    });

    it('V-42 token already exists, explicit null → 409 stale', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], null);
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], null);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STALE_VA);
    });

    it('V-43 malformed token → 400 "Invalid expectedUpdatedAt"', async () => {
      const s = await base();
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], 'abc');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'Invalid expectedUpdatedAt',
      );
    });

    it('V-44 well-formed but different token (date-only) → 409; unparseable → 400', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], null);
      expect(
        (await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], '2020-01-01'))
          .status,
      ).toBe(409);
      expect(
        (await api.save(s.paperId, [al(s.v1, s.dist, s.p, 2)], 'not-a-date'))
          .status,
      ).toBe(400);
    });

    it('V-45 quantities 5, 5.5, 5.25, 5.00, 10000 are accepted and stored as given', async () => {
      const s = await base();
      let tok: string | null = null;
      for (const q of [5, 5.5, 5.25, 5.0, 10000]) {
        const r = await api.save(s.paperId, [al(s.v1, s.dist, s.p, q)], tok);
        expect(r.status, `${q}: ${body(r)}`).toBe(200);
        tok = await tokenOf(s.paperId);
        expect(num((await vaRows(ctx, s.paperId))[0].allocated_qty)).toBe(q);
      }
    });

    it('V-46 5.255, 10000.01, -1, "5" → 400, never rounded, nothing saved', async () => {
      const s = await base();
      for (const q of [5.255, 10000.01, -1, '5']) {
        expect(
          (await api.save(s.paperId, [al(s.v1, s.dist, s.p, q)], null)).status,
          String(q),
        ).toBe(400);
      }
      expect(await vaPaper(ctx, s.paperId)).toBeNull();
    });

    it('V-47 "" and null are read as 0: they clear a stored cell', async () => {
      const s = await base();
      for (const blank of ['', null]) {
        await api.save(
          s.paperId,
          [al(s.v1, s.dist, s.p, 5)],
          await tokenOf(s.paperId),
        );
        expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
        const res = await api.save(
          s.paperId,
          [al(s.v1, s.dist, s.p, blank)],
          await tokenOf(s.paperId),
        );
        expect(res.status, body(res)).toBe(200);
        expect(res.body.changed).toBe(true);
        expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
      }
    });

    it('V-48 allocatedQty omitted from an entry → 400 (not read as 0)', async () => {
      const s = await base();
      const { allocatedQty: _omit, ...entry } = al(s.v1, s.dist, s.p, 1);
      expect((await api.save(s.paperId, [entry], null)).status).toBe(400);
    });

    it('V-49 ids 0 / 1.5 / 2147483648 and category FOO → 400', async () => {
      const s = await base();
      const good = al(s.v1, s.dist, s.p, 1);
      const variants: Record<string, unknown>[] = [];
      for (const bad of [0, 1.5, 2147483648]) {
        variants.push(
          { ...good, vehicleId: bad },
          { ...good, distributorId: bad },
          { ...good, productId: bad },
        );
      }
      variants.push({ ...good, category: 'FOO' });
      for (const [i, entry] of variants.entries()) {
        expect(
          (await api.save(s.paperId, [entry], null)).status,
          `variant ${i}`,
        ).toBe(400);
      }
    });

    it('V-50 5001 allocations → 400', async () => {
      const s = await base();
      const many = Array.from({ length: 5001 }, () => al(s.v1, s.dist, s.p, 0));
      const res = await api.save(s.paperId, many, null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('5000');
    });

    it('V-51 empty allocations with nothing stored → 200 no-op, changed false, token null', async () => {
      const s = await base();
      const res = await api.save(s.paperId, [], null);
      expect(res.status, body(res)).toBe(200);
      expect(res.body).toMatchObject({
        changed: false,
        vehicleAllocationPaperUpdatedAt: null,
      });
    });

    it('V-52 same vehicle + distributor + category + product twice (even both 0) → 400 duplicate with names', async () => {
      const s = await base();
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 0), al(s.v1, s.dist, s.p, 0)],
        null,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Duplicate allocation entries. Each vehicle, distributor, category and product combination can only appear once.',
      );
      expect(res.body.details).toHaveLength(1);
      expect(res.body.details[0]).toContain(vname(s.v1));
      expect(res.body.details[0]).toContain(s.dist.name);
    });

    it('V-53 duplicate entry together with a stale token → 409 (token is checked first)', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], null);
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 1), al(s.v1, s.dist, s.p, 2)],
        null,
      );
      expect(res.status).toBe(409);
    });

    it('V-54 session not editable → 400 naming status, open session and "refresh", even with a stale token', async () => {
      const s = await base();
      await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 1)],
        '2020-01-01T00:00:00.000Z',
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'The NIGHT allocation can no longer be edited because the paper is now NIGHT_SUBMITTED. The session currently open for editing is MORNING. Refresh the allocation data and try again.',
      );
    });

    it('V-55 DRAFT: NIGHT and MORNING saves are both accepted (one header per session)', async () => {
      const s = await twoSessionScene(ctx, { qtyNight: 4, qtyMorning: 7 });
      const v = await addVehicle(ctx);
      const a = await api.save(s.paperId, [al(v, s.dist, s.p, 4)], null, {
        session: 'NIGHT',
      });
      const b = await api.save(s.paperId, [al(v, s.dist, s.p, 7)], null, {
        session: 'MORNING',
      });
      expect(a.status, body(a)).toBe(200);
      expect(b.status, body(b)).toBe(200);
      expect(
        num((await vaRows(ctx, s.paperId, 'NIGHT'))[0].allocated_qty),
      ).toBe(4);
      expect(
        num((await vaRows(ctx, s.paperId, 'MORNING'))[0].allocated_qty),
      ).toBe(7);
    });

    it('V-56 REOPENED / MORNING_SUBMITTED / FINALIZED: save and reconcile of either session → 400 "No allocation session is open"', async () => {
      const s = await base();
      for (const status of [
        'REOPENED',
        'MORNING_SUBMITTED',
        'FINALIZED',
      ] as const) {
        await ctx.setStatus(s.sheet, status);
        for (const session of ['NIGHT', 'MORNING']) {
          const w = await api.save(
            s.paperId,
            [al(s.v1, s.dist, s.p, 1)],
            null,
            { session },
          );
          expect(w.status, `${status}/${session} save`).toBe(400);
          expect(w.body.message).toContain(
            'No allocation session is open for editing',
          );
          const r = await api.reconcile(s.paperId, null, { session });
          expect(r.status, `${status}/${session} reconcile`).toBe(400);
          expect(r.body.message).toContain(
            'No allocation session is open for editing',
          );
        }
      }
    });
  });

  // ------------------------------------------------------------------ C4
  describe('business rules', () => {
    it('V-60 unknown vehicle id, any quantity → 400 "Vehicle <id> does not exist"', async () => {
      const s = await base();
      for (const q of [5, 0]) {
        const res = await api.save(
          s.paperId,
          [al({ id: MISSING }, s.dist, s.p, q)],
          null,
        );
        expect(res.status, `qty ${q}`).toBe(400);
        expect(res.body.details).toContain(`Vehicle ${MISSING} does not exist`);
      }
    });

    it('V-61 inactive vehicle with quantity > 0 → 400 "is inactive and cannot receive allocations"', async () => {
      const s = await base();
      const off = await addVehicle(ctx, { active: false });
      const res = await api.save(s.paperId, [al(off, s.dist, s.p, 3)], null);
      expect(res.status).toBe(400);
      expect(res.body.details).toContain(
        `Vehicle "${vname(off)}" is inactive and cannot receive allocations`,
      );
    });

    it('V-62 inactive vehicle with quantity 0 is accepted and clears the stranded row', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      await setVehicleActive(ctx, s.v1, false);
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 0)],
        await tokenOf(s.paperId),
      );
      expect(res.status, body(res)).toBe(200);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
      expect(res.body.flaggedAnomalies).toBe(1);
    });

    it('V-63 quantity > 0 where the distributor has no active link → 400, every offending row listed', async () => {
      const s = await base({ products: [{}, {}] });
      const [p0, p1] = s.products;
      await setLinksActive(ctx, p0.links, false);
      await setLinksActive(ctx, p1.links, false);
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, p0, 1), al(s.v1, s.dist, p1, 1)],
        null,
      );
      expect(res.status).toBe(400);
      expect(res.body.details).toHaveLength(2);
      for (const d of res.body.details) {
        expect(d).toContain('does not have an active link to');
        expect(d).toContain(s.dist.name);
      }
    });

    it('V-64 quantity 0 where there is no link → accepted', async () => {
      const s = await base();
      await setLinksActive(ctx, s.p.links, false);
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 0)], null);
      expect(res.status, body(res)).toBe(200);
    });

    describe('V-65 quantity > 0 for something not currently required → 400', () => {
      const notRequired = (res: { status: number; body: any }) => {
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body.details)).toContain(
          "is not required in this session's orders",
        );
      };

      it('V-65a wrong category', async () => {
        const s = await base();
        notRequired(
          await api.save(
            s.paperId,
            [al(s.v1, s.dist, s.p, 1, 'NON_MILK')],
            null,
          ),
        );
      });

      it('V-65b other distributor', async () => {
        const w = ctx.world;
        const s = await base({
          products: [{ distributors: [{ dist: w.distA }, { dist: w.distB }] }],
        });
        const res = await api.save(
          s.paperId,
          [al(s.v1, w.distB, s.p, 1)],
          null,
        );
        notRequired(res);
        expect(JSON.stringify(res.body.details)).toContain(w.distB.name);
      });

      it('V-65c product with zero demand', async () => {
        const s = await base();
        await setDemand(ctx, s.sheet, s.c, s.p, 0);
        notRequired(
          await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], null),
        );
      });

      it('V-65d demand exists only in the other session', async () => {
        const s = await base();
        await setSheetSession(ctx, s.sheet.sheetId, 'MORNING');
        notRequired(
          await api.save(s.paperId, [al(s.v1, s.dist, s.p, 1)], null, {
            session: 'NIGHT',
          }),
        );
      });
    });

    it('V-66 a row with both no link and not required → the link message is returned', async () => {
      const w = ctx.world;
      const s = await base({
        products: [{ distributors: [{ dist: w.distA }, { dist: w.distB }] }],
      });
      await ctx.db.master_product_link.update({
        where: { id: s.p.links[w.distB.id] },
        data: { is_active: false },
      });
      const res = await api.save(s.paperId, [al(s.v1, w.distB, s.p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.details)).toContain(
        'does not have an active link',
      );
      expect(JSON.stringify(res.body.details)).not.toContain('is not required');
    });

    it('V-67 one vehicle, same category, two distributors, both > 0 → 400 naming vehicle, category, distributors', async () => {
      const s = await splitScene(ctx);
      const v = await addVehicle(ctx);
      const res = await api.save(
        s.paperId,
        [al(v, s.A, s.p, 1), al(v, s.B, s.p, 1)],
        null,
      );
      expect(res.status, body(res)).toBe(400);
      expect(res.body.message).toBe(
        'A vehicle cannot take a category from more than one distributor',
      );
      const d = res.body.details[0];
      for (const part of [vname(v), 'MILK', s.A.name, s.B.name])
        expect(d).toContain(part);
      expect(await vaPaper(ctx, s.paperId)).toBeNull();
    });

    it('V-68 one vehicle takes MILK from A and NON_MILK from B → accepted', async () => {
      const w = ctx.world;
      const s = await demandScene(ctx, {
        qty: 3,
        products: [
          {},
          { category: 'NON_MILK' as never, distributors: [{ dist: w.distB }] },
        ],
        clientOpts: {
          categories: [
            { category: 'MILK' as never, supplier: w.distA },
            { category: 'NON_MILK' as never, supplier: w.distB },
          ],
        },
      });
      const v = await addVehicle(ctx);
      const [milk, nonMilk] = s.products;
      const res = await api.save(
        s.paperId,
        [
          al(v, w.distA, milk, 3, 'MILK'),
          al(v, w.distB, nonMilk, 3, 'NON_MILK'),
        ],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(2);
    });

    it('V-69 a second distributor that appears only with quantity 0 is not counted', async () => {
      const s = await splitScene(ctx);
      const v = await addVehicle(ctx);
      const res = await api.save(
        s.paperId,
        [al(v, s.A, s.p, 4), al(v, s.B, s.p, 0)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    });

    it('V-70 same vehicle takes MILK from A in NIGHT and from B in MORNING → accepted (rule is per session)', async () => {
      const w = ctx.world;
      const s = await twoSessionScene(ctx, {
        productOpts: { distributors: [{ dist: w.distA }, { dist: w.distB }] },
        morningSupplier: w.distB,
      });
      const v = await addVehicle(ctx);
      const a = await api.save(s.paperId, [al(v, w.distA, s.p, 4)], null, {
        session: 'NIGHT',
      });
      const b = await api.save(s.paperId, [al(v, w.distB, s.p, 7)], null, {
        session: 'MORNING',
      });
      expect(a.status, body(a)).toBe(200);
      expect(b.status, body(b)).toBe(200);
    });

    it('V-71 under- and over-allocation are accepted at save; completion shows incomplete', async () => {
      const s = await base({ qty: 10 });
      for (const q of [4, 15]) {
        const r = await api.save(
          s.paperId,
          [al(s.v1, s.dist, s.p, q)],
          await tokenOf(s.paperId),
        );
        expect(r.status, `${q}: ${body(r)}`).toBe(200);
        const v = (await api.get(s.paperId)).body;
        expect(v.completion.isComplete).toBe(false);
        expect(v.completion.lines[0]).toMatchObject({
          requiredQty: 10,
          allocatedQty: q,
          isComplete: false,
        });
      }
    });

    it('V-72 allocation far above vehicle capacity is accepted (capacity is never validated)', async () => {
      const s = await demandScene(ctx);
      const small = await addVehicle(ctx, { capacity: 1 });
      const res = await api.save(
        s.paperId,
        [al(small, s.dist, s.p, 500)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
    });

    it('V-73 inactive distributor with an active link and demand → allocation allowed', async () => {
      const w = ctx.world;
      const dX = await w.addDistributor();
      const s = await demandScene(ctx, {
        products: [{ distributors: [{ dist: dX }] }],
        clientOpts: {
          categories: [
            { category: 'MILK' as never, supplier: dX },
            { category: 'NON_MILK' as never, supplier: dX },
          ],
        },
      });
      await ctx.db.master_distributor.update({
        where: { id: dX.id },
        data: { is_active: false },
      });
      const v = await addVehicle(ctx);
      const res = await api.save(s.paperId, [al(v, dX, s.p, 10)], null);
      expect(res.status, body(res)).toBe(200);
    });

    it('V-74 zero / blank are never stored; zero for a stored row deletes it without confirmation; zero for no row is a no-op', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 5)], null);
      const del = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 0)],
        await tokenOf(s.paperId),
      );
      expect(del.status, body(del)).toBe(200);
      expect(del.body.changed).toBe(true);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
      for (const z of [0, '', null]) {
        const r = await api.save(
          s.paperId,
          [al(s.v2, s.dist, s.p, z)],
          await tokenOf(s.paperId),
        );
        expect(r.status, `${z}`).toBe(200);
        expect(r.body.changed).toBe(false);
      }
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
    });

    it('V-75 a new or changed row stores the quantity and the requirement snapshot', async () => {
      const s = await base({ qty: 10 });
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      expect(num((await vaRows(ctx, s.paperId))[0].required_qty_at_save)).toBe(
        10,
      );
    });

    it('V-76 identical payload (rows, snapshots, anomaly states unchanged) → changed false, current token, nothing written', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      const tok = await tokenOf(s.paperId);
      const before = (await vaRows(ctx, s.paperId))[0];
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], tok);
      expect(res.status, body(res)).toBe(200);
      expect(res.body).toMatchObject({
        changed: false,
        vehicleAllocationPaperUpdatedAt: tok,
      });
      expect(await tokenOf(s.paperId)).toBe(tok);
      expect((await vaRows(ctx, s.paperId))[0].updated_at.getTime()).toBe(
        before.updated_at.getTime(),
      );
    });

    it('V-77 identical payload with a stale token → 409', async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 4)],
        '2020-01-01T00:00:00.000Z',
      );
      expect(res.status).toBe(409);
    });

    it('V-78 identical payload re-sent with the NEW token → safe no-op', async () => {
      const s = await base();
      const first = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      const again = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 4)],
        first.body.vehicleAllocationPaperUpdatedAt,
      );
      expect(again.status, body(again)).toBe(200);
      expect(again.body.changed).toBe(false);
    });

    it('V-79 same quantity but the requirement changed since the save → counts as a change (snapshot refreshed, token advanced)', async () => {
      const s = await base({ qty: 10 });
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      const tok = await tokenOf(s.paperId);
      await setDemand(ctx, s.sheet, s.c, s.p, 12);
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], tok);
      expect(res.status, body(res)).toBe(200);
      expect(res.body.changed).toBe(true);
      expect(await tokenOf(s.paperId)).not.toBe(tok);
      expect(num((await vaRows(ctx, s.paperId))[0].required_qty_at_save)).toBe(
        12,
      );
    });

    it('V-80 response shape', async () => {
      const s = await base();
      const res = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      expect(res.body).toEqual({
        success: true,
        changed: true,
        vehicleAllocationPaperUpdatedAt: expect.any(String),
        flaggedAnomalies: 0,
        reconciledAnomalies: 0,
      });
    });

    it('V-81 unknown distributor or product id with quantity 0 → 400 listing every problem', async () => {
      const s = await base();
      const res = await api.save(
        s.paperId,
        [
          al(s.v1, { id: MISSING }, s.p, 0),
          al(s.v1, s.dist, { id: MISSING }, 0),
        ],
        null,
      );
      expect(res.status, body(res)).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          `Distributor ${MISSING} does not exist`,
          `Product ${MISSING} does not exist`,
        ]),
      );
    });

    it('V-82 one bad entry among several fails the whole request; nothing saved', async () => {
      const s = await base();
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, s.p, 2), al({ id: MISSING }, s.dist, s.p, 1)],
        null,
      );
      expect(res.status).toBe(400);
      expect(await vaPaper(ctx, s.paperId)).toBeNull();
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
    });

    it('V-182 allocations [] with nothing stored and null token → 200 changed false, nothing written', async () => {
      const s = await base();
      const res = await api.save(s.paperId, [], null);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        changed: false,
        vehicleAllocationPaperUpdatedAt: null,
      });
      expect(await vaPaper(ctx, s.paperId)).toBeNull();
    });

    it('V-183 unknown productId with quantity 5 → 400 "Product <id> does not exist" (before link / required checks)', async () => {
      const s = await base();
      const res = await api.save(
        s.paperId,
        [al(s.v1, s.dist, { id: MISSING }, 5)],
        null,
      );
      expect(res.status).toBe(400);
      expect(res.body.details).toContain(`Product ${MISSING} does not exist`);
    });
  });

  // ------------------------------------------------------------------ C5
  describe('deletions and confirmation', () => {
    const stored = async () => {
      const s = await base();
      await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null);
      return { ...s, tok: (await tokenOf(s.paperId))! };
    };

    it('V-90 a stored valid row absent from the payload, no confirmDeletions → 400 droppedAllocations (names, quantity) + current token; nothing written', async () => {
      const s = await stored();
      const res = await api.save(s.paperId, [al(s.v2, s.dist, s.p, 2)], s.tok);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(DROPPED_MSG);
      expect(res.body.droppedAllocations).toHaveLength(1);
      expect(res.body.droppedAllocations[0]).toMatchObject({
        vehicleName: vname(s.v1),
        distributorName: s.dist.name,
        category: 'MILK',
        allocatedQty: 4,
      });
      expect(res.body.vehicleAllocationPaperUpdatedAt).toBe(s.tok);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
      expect(await tokenOf(s.paperId)).toBe(s.tok);
    });

    it('V-91 resend with confirmDeletions: true and the same token → rows deleted, token advanced', async () => {
      const s = await stored();
      const res = await api.save(s.paperId, [al(s.v2, s.dist, s.p, 2)], s.tok, {
        confirm: true,
      });
      expect(res.status, body(res)).toBe(200);
      const rows = await vaRows(ctx, s.paperId);
      expect(rows.map((r) => r.vehicle_id)).toEqual([s.v2.id]);
      expect(await tokenOf(s.paperId)).not.toBe(s.tok);
    });

    it('V-92 confirmed resend after another user changed the allocation → 409; never applied to changed data', async () => {
      const s = await stored();
      const dropped = await api.save(
        s.paperId,
        [al(s.v2, s.dist, s.p, 2)],
        s.tok,
      );
      const t0 = dropped.body.vehicleAllocationPaperUpdatedAt;
      const other = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 5)], t0, {
        token: ctx.tokens.emp2,
      });
      expect(other.status, body(other)).toBe(200);
      const res = await api.save(s.paperId, [al(s.v2, s.dist, s.p, 2)], t0, {
        confirm: true,
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STALE_VA);
      expect(num((await vaRows(ctx, s.paperId))[0].allocated_qty)).toBe(5);
    });

    it('V-93 a stored INVALID row absent from the payload is not an omission: flagged and removed automatically', async () => {
      const s = await stored();
      await setVehicleActive(ctx, s.v1, false);
      const res = await api.save(s.paperId, [], s.tok);
      expect(res.status, body(res)).toBe(200);
      expect(res.body).toMatchObject({ changed: true, flaggedAnomalies: 1 });
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
    });

    it('V-94 empty allocations while rows are stored → 400 droppedAllocations unless confirmDeletions: true', async () => {
      const s = await stored();
      const res = await api.save(s.paperId, [], s.tok);
      expect(res.status).toBe(400);
      expect(res.body.droppedAllocations).toHaveLength(1);
      const ok = await api.save(s.paperId, [], s.tok, { confirm: true });
      expect(ok.status, body(ok)).toBe(200);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
    });

    it('V-95 confirmed empty snapshot removes all rows; with zero demand the session then passes', async () => {
      const s = await stored();
      const ok = await api.save(s.paperId, [], s.tok, { confirm: true });
      expect(ok.status, body(ok)).toBe(200);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(0);
      await ctx.db.order_sheet_items.updateMany({
        where: { order_sheet_id: s.sheet.sheetId },
        data: { ordered_qty: 0 },
      });
      const b = (await api.get(s.paperId)).body;
      expect(b.completion).toEqual({ isComplete: true, lines: [] });
      expect(b.submission.ready).toBe(true);
    });

    it('V-96 confirmDeletions: true when nothing is omitted has no effect', async () => {
      const s = await base();
      const a = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], null, {
        confirm: true,
      });
      expect(a.status, body(a)).toBe(200);
      const tok = await tokenOf(s.paperId);
      const b = await api.save(s.paperId, [al(s.v1, s.dist, s.p, 4)], tok, {
        confirm: true,
      });
      expect(b.body.changed).toBe(false);
      expect(await vaRows(ctx, s.paperId)).toHaveLength(1);
    });
  });

  // unused-import guard for helpers kept for readability
  void [n, gridOf];
});
