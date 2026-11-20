/**
 * Purchase – zero-allocation sign-off and admin rate recalculation.
 * Scenarios: PU-130 .. PU-137, PU-139, PU-140 .. PU-147   (spec: PD-23, PD-24, PD-25, PD-38, PD-52, PD-64, PD-66, PD-67, DT-10.1)
 * PU-138 (Paper readiness announcements) is in purchase.scenario.gates.spec.ts.
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
  addDays,
  allocRow,
  breakOrderUnit,
  cleanupPuTests,
  pe,
  puApi,
  puEntries,
  puPaper,
  puToken,
  purchaseScene,
  seedAlloc,
  addVehicle,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';
import { PurchaseValidationService } from './services/purchase-validation.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';

describe('Purchase sign-off and rate recalculation', () => {
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
  const E = (s: Sc, qty: unknown, p: { id: number } = s.p) =>
    pe(ctx, s.paperId, s.v1, s.dist, p, qty);
  const dairyHeader = (paperId: number) =>
    ctx.db.dairy_tray_paper.findUnique({ where: { order_paper_id: paperId } });
  const pending = (paperId: number) =>
    ctx.app
      .get(PurchaseValidationService, { strict: false })
      .isZeroAllocationSignOffPending(paperId, ctx.prisma as never);

  // ------------------------------------------------------------------ sign-off
  describe('zero-allocation sign-off', () => {
    it('PU-130 / PU-139 NIGHT_SUBMITTED, no allocation, no header, token null → header with signed_off_at / by, new token; an EMPLOYEE may do it; dairy header ensured', async () => {
      const s = await purchaseScene(ctx, { alloc: 0 });
      await ctx.db.dairy_tray_paper.deleteMany({
        where: { order_paper_id: s.paperId },
      });
      const r = await api.signOff(s.paperId, null, { token: ctx.tokens.emp });
      expect(r.status, body(r)).toBe(200);
      expect(r.body.changed).toBe(true);
      const h = (await puPaper(ctx, s.paperId))!;
      expect(h.signed_off_at).not.toBeNull();
      expect(h.signed_off_by).toBe(ctx.users.emp.id);
      expect(r.body.purchasePaperUpdatedAt).toBe(h.updated_at.toISOString());
      expect(await dairyHeader(s.paperId)).not.toBeNull();
    });

    it('PU-131 header already exists → token advanced once, sign-off recorded', async () => {
      const s = await purchaseScene(ctx, { alloc: 0 });
      const h = await ctx.db.purchase_paper.create({
        data: { order_paper_id: s.paperId },
      });
      const t = h.updated_at.toISOString();
      const r = await api.signOff(s.paperId, t);
      expect(r.status, body(r)).toBe(200);
      expect(r.body.changed).toBe(true);
      expect(r.body.purchasePaperUpdatedAt).not.toBe(t);
      expect((await puPaper(ctx, s.paperId))!.signed_off_at).not.toBeNull();
    });

    it('PU-132 any allocation above 0 → 400', async () => {
      const s = await purchaseScene(ctx);
      const r = await api.signOff(s.paperId, null);
      expect(r.status).toBe(400);
      expect(body(r)).toContain(
        'only possible when no vehicle allocation exists',
      );
    });

    it('PU-133 DRAFT, MORNING_SUBMITTED, FINALIZED → 400', async () => {
      const s = await purchaseScene(ctx, { alloc: 0 });
      for (const status of [
        'DRAFT',
        'MORNING_SUBMITTED',
        'FINALIZED',
      ] as const) {
        await ctx.setStatus(s.sheet, status);
        expect((await api.signOff(s.paperId, null)).status, status).toBe(400);
      }
    });

    it('PU-134 repeat with the current token → changed false, same token, dairy header still ensured; stale → 409; omitted → 400', async () => {
      const s = await purchaseScene(ctx, { alloc: 0 });
      const first = await api.signOff(s.paperId, null);
      expect(first.status, body(first)).toBe(200);
      const t = await puToken(ctx, s.paperId);
      await ctx.db.dairy_tray_paper.deleteMany({
        where: { order_paper_id: s.paperId },
      });
      const again = await api.signOff(s.paperId, t);
      expect(again.status, body(again)).toBe(200);
      expect(again.body).toMatchObject({
        changed: false,
        purchasePaperUpdatedAt: t,
      });
      expect(await dairyHeader(s.paperId)).not.toBeNull();
      expect(
        (await api.signOff(s.paperId, '2020-01-01T00:00:00.000Z')).status,
      ).toBe(409);
      expect((await api.signOff(s.paperId, undefined)).status).toBe(400);
    });

    it('PU-135 / PU-136 an allocation appearing makes the sign-off stop counting; if all allocations disappear again it counts again (PD-66)', async () => {
      const s = await purchaseScene(ctx, { alloc: 0 });
      expect((await api.signOff(s.paperId, null)).status).toBe(200);
      expect(await pending(s.paperId)).toBe(false);
      const v = await addVehicle(ctx);
      await seedAlloc(ctx, s.paperId, [
        {
          vehicleId: v.id,
          distributorId: s.dist.id,
          productId: s.p.id,
          qty: 5,
          snapshot: 10,
        },
      ]);
      expect((await api.get(s.paperId)).body.zeroAllocation.noAllocations).toBe(
        false,
      );
      expect(await pending(s.paperId)).toBe(false);
      await ctx.db.vehicle_allocation.deleteMany({
        where: { vehicle_id: v.id },
      });
      expect((await api.get(s.paperId)).body.zeroAllocation).toMatchObject({
        noAllocations: true,
        signOffRequired: false,
      });
      expect(await pending(s.paperId)).toBe(false); // the earlier sign-off counts again
    });

    it('PU-137 a sign-off cannot be revoked: no endpoint exists', async () => {
      const s = await purchaseScene(ctx, { alloc: 0 });
      await api.signOff(s.paperId, null);
      const r = await ctx.call(
        'post',
        `/purchases/${s.paperId}/revoke-sign-off`,
        ctx.tokens.admin,
        { expectedUpdatedAt: null },
      );
      expect(r.status).toBe(404);
      expect((await puPaper(ctx, s.paperId))!.signed_off_at).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------ recalculation
  describe('admin rate recalculation', () => {
    const reopenedWithEntry = async (
      o: Parameters<typeof purchaseScene>[1] = {},
    ) => {
      const s = await purchaseScene(ctx, o);
      const r = await api.save(
        s.paperId,
        await Promise.all(s.products.map((p) => E(s, 4, p))),
        null,
      );
      expect(r.status, body(r)).toBe(200);
      await ctx.setStatus(s.sheet, 'REOPENED');
      return s;
    };

    it('PU-140 paper not REOPENED → 400', async () => {
      const s = await purchaseScene(ctx);
      const r = await api.recalc(s.paperId, null, 'x');
      expect(r.status).toBe(400);
      expect(r.body.message).toBe(
        'Rates can only be recalculated while the paper is REOPENED',
      );
    });

    it('PU-141 REOPENED with changes → link, rate, amount refreshed; token advanced; logged with old and new values', async () => {
      const s = await reopenedWithEntry();
      await ctx.db.distributor_product_rate.updateMany({
        where: { product_link_id: s.p.links[s.dist.id] },
        data: { purchase_rate: 70 },
      });
      const before = await puToken(ctx, s.paperId);
      const log = vi.spyOn(Logger.prototype, 'log');
      const r = await api.recalc(s.paperId, before, 'rate correction');
      expect(r.status, body(r)).toBe(200);
      expect(r.body).toMatchObject({ changed: true, recalculatedEntries: 1 });
      expect(r.body.purchasePaperUpdatedAt).not.toBe(before);
      const e = (await puEntries(ctx, s.paperId))[0];
      expect([num(e.purchase_rate), num(e.purchase_amount)]).toEqual([
        70,
        4 * 12 * 70,
      ]);
      const lines = log.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes('PURCHASE_RATE_RECALCULATION'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`"userId":${ctx.users.admin.id}`);
      expect(lines[0]).toContain('rate correction');
      expect(lines[0]).toContain('oldValues');
      expect(lines[0]).toContain('newValues');
    });

    it('PU-142 an entry with no rate, and one with no order unit → 400, every problem listed, nothing changed', async () => {
      const s = await reopenedWithEntry({ products: [{}, {}] });
      await ctx.world.deleteRates(s.products[0]);
      await breakOrderUnit(ctx, s.products[1].id);
      const t = await puToken(ctx, s.paperId);
      const r = await api.recalc(s.paperId, t, 'x');
      expect(r.status, body(r)).toBe(400);
      expect(r.body.message).toBe(
        'Rate recalculation failed. Nothing was changed',
      );
      expect(r.body.details).toHaveLength(2);
      expect(await puToken(ctx, s.paperId)).toBe(t);
      expect(
        (await puEntries(ctx, s.paperId)).map((e) => num(e.purchase_rate)),
      ).toEqual([56, 56]);
    });

    it('PU-143 nothing differs → changed false, token unchanged', async () => {
      const s = await reopenedWithEntry();
      const t = await puToken(ctx, s.paperId);
      const r = await api.recalc(s.paperId, t, 'x');
      expect(r.status, body(r)).toBe(200);
      expect(r.body).toMatchObject({
        changed: false,
        purchasePaperUpdatedAt: t,
        recalculatedEntries: 0,
      });
    });

    it('PU-144 an orphan with a missing rate fails the whole recalculation (PD-23)', async () => {
      const s = await reopenedWithEntry({ products: [{}, {}] });
      await ctx.db.vehicle_allocation.delete({
        where: {
          id: (await allocRow(ctx, s.paperId, s.v1.id, s.products[1].id))!.id,
        },
      });
      await ctx.world.deleteRates(s.products[1]);
      const r = await api.recalc(s.paperId, await puToken(ctx, s.paperId), 'x');
      expect(r.status, body(r)).toBe(400);
      expect(body(r)).toContain('no purchase rate found for');
    });

    it('PU-145 no header and token null → changed false', async () => {
      const s = await purchaseScene(ctx, { status: 'REOPENED' });
      const r = await api.recalc(s.paperId, null, 'x');
      expect(r.status, body(r)).toBe(200);
      expect(r.body.changed).toBe(false);
    });

    it('PU-146 brand policy changed after the save: an ordinary save keeps the gatepass date; recalculation re-resolves it', async () => {
      const s = await reopenedWithEntry();
      const saleIso = iso(s.sheet.saleDate);
      await ctx.db.master_brand.update({
        where: { id: ctx.world.brandPlain.id },
        data: { gatepass_date_policy: 'PREVIOUS_DAY' as never },
      });
      const save = await api.save(
        s.paperId,
        [await E(s, 5)],
        await puToken(ctx, s.paperId),
      );
      expect(save.status, body(save)).toBe(200);
      expect(iso((await puEntries(ctx, s.paperId))[0].gatepass_date)).toBe(
        saleIso,
      );
      const r = await api.recalc(
        s.paperId,
        await puToken(ctx, s.paperId),
        'policy change',
      );
      expect(r.status, body(r)).toBe(200);
      expect(r.body.changed).toBe(true);
      expect(iso((await puEntries(ctx, s.paperId))[0].gatepass_date)).toBe(
        iso(addDays(s.sheet.saleDate, -1)),
      );
    });

    it('PU-126b / PU-147 recalculation never recalculates dairy trays', async () => {
      const s = await reopenedWithEntry({ products: [{ tray: true }] });
      await ctx.db.distributor_product_rate.updateMany({
        where: { product_link_id: s.p.links[s.dist.id] },
        data: { purchase_rate: 70 },
      });
      const spy = vi.spyOn(DependencyOrchestratorService.prototype, 'execute');
      const r = await api.recalc(s.paperId, await puToken(ctx, s.paperId), 'x');
      expect(r.body.changed).toBe(true);
      expect(spy.mock.calls.filter((c) => c[0] === 'PURCHASE')).toHaveLength(0);
    });
  });
});
