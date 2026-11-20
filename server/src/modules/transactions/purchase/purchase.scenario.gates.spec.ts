/**
 * Purchase – submission gate called by Paper.
 * Scenarios: PU-138, PU-150 .. PU-158   (spec: PD-36, PD-37, PD-38, PD-41, PD-42, PD-54, PD-65, PD-68, PD-70, PA-7.4, PA-19.5, PA-8.3)
 * The gate service is called directly (as the Orders and Vehicle Allocation gate specs) for its structured body; Paper readiness
 * (same collectors, PA-19.3) is used for the Paper-level rows. Needs the Paper module.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addVehicle,
  al,
  allocRow,
  cleanupPuTests,
  pe,
  puApi,
  puToken,
  purchaseScene,
  setAllocQty,
  twoSessionPurchaseScene,
  vaApi,
  vaToken,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';
import { PaperModule } from '../paper/paper.module.js';
import { PurchaseValidationService } from './services/purchase-validation.service.js';

describe('Purchase submission gate', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof puApi>;
  let gate: PurchaseValidationService;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({
      modules: [PurchaseModule, PaperModule],
    });
    api = puApi(ctx);
    gate = ctx.app.get(PurchaseValidationService, { strict: false });
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupPuTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  type Sc = Awaited<ReturnType<typeof purchaseScene>>;
  const E = (s: Sc, qty: unknown, p: { id: number } = s.p) =>
    pe(ctx, s.paperId, s.v1, s.dist, p, qty);
  const run = (paperId: number) =>
    gate.validatePurchasesComplete(paperId, ctx.prisma as never);
  /** The 400 body of a rejected gate, or null when it passed. */
  const rejection = async (paperId: number) => {
    try {
      await run(paperId);
    } catch (e: any) {
      expect(e.getStatus?.(), String(e)).toBe(400);
      return e.getResponse() as {
        message: string;
        missing: string[];
        stale: string[];
        orphans: string[];
        zeroAllocationSignOffRequired: boolean;
        details: string[];
      };
    }
    return null;
  };
  const readiness = async (paperId: number) => {
    const r = await ctx.call(
      'get',
      `/papers/${paperId}/readiness`,
      ctx.tokens.emp,
    );
    expect(r.status, body(r)).toBe(200);
    return r.body as {
      action: string | null;
      problems: string[];
      warnings: string[];
      requiredActions: string[];
    };
  };
  const purchaseProblems = (r: { problems: string[] }) =>
    r.problems.filter((p) =>
      /^(Purchase missing|Stale \(allocation|Unresolved orphan|Zero allocation)/.test(
        p,
      ),
    );
  const saveAll = async (s: Sc, qty: number) => {
    const r = await api.save(
      s.paperId,
      await Promise.all(s.products.map((p) => E(s, qty, p))),
      null,
    );
    expect(r.status, body(r)).toBe(200);
  };

  it('PU-150 every allocated cell (both sessions) has a saved entry, confirmed zeros included, nothing stale or orphan → passes', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    const entries = [
      await pe(ctx, t.paperId, t.v, t.dist, t.p, t.qn),
      await pe(ctx, t.paperId, t.v, t.dist, t.p, 0, { session: 'MORNING' }),
    ];
    expect((await api.save(t.paperId, entries, null)).status).toBe(200);
    await expect(run(t.paperId)).resolves.toBeUndefined();
  });

  it('PU-151 an allocated cell with no saved entry → 400 "Purchase missing"; Paper readiness lists it', async () => {
    const s = await purchaseScene(ctx);
    const r = await rejection(s.paperId);
    expect(r!.message).toBe('Purchases have not been completed');
    expect(r!.missing).toHaveLength(1);
    expect(r!.details[0]).toContain('Purchase missing:');
    const ready = await readiness(s.paperId);
    expect(ready.action).toBe('SUBMIT_MORNING');
    expect(
      purchaseProblems(ready).some((p) => p.startsWith('Purchase missing:')),
    ).toBe(true);
  });

  it('PU-152 stale entry is listed under stale[]; an orphan under orphans[] only, never also as stale', async () => {
    const s = await purchaseScene(ctx, { products: [{}, {}] });
    const [p0, p1] = s.products;
    await saveAll(s, 10);
    await setAllocQty(
      ctx,
      (await allocRow(ctx, s.paperId, s.v1.id, p0.id))!.id,
      8,
    );
    await ctx.db.vehicle_allocation.delete({
      where: { id: (await allocRow(ctx, s.paperId, s.v1.id, p1.id))!.id },
    });
    const r = await rejection(s.paperId);
    expect(r!.stale).toHaveLength(1);
    expect(r!.orphans).toHaveLength(1);
    expect(r!.missing).toEqual([]);
  });

  it('PU-153 no allocation and no sign-off → blocked with zeroAllocationSignOffRequired; Paper requiredActions; cleared by the sign-off', async () => {
    const s = await purchaseScene(ctx, { alloc: 0 });
    const r = await rejection(s.paperId);
    expect(r!.zeroAllocationSignOffRequired).toBe(true);
    expect(r!.details.some((d) => d.includes('sign-off is required'))).toBe(
      true,
    );
    const ready = await readiness(s.paperId);
    expect(ready.requiredActions).toEqual(['SIGN_OFF_ZERO_ALLOCATION']);
    expect(ready.problems.some((p) => p.includes('sign-off is required'))).toBe(
      true,
    );
    expect((await api.signOff(s.paperId, null)).status).toBe(200);
    expect(await rejection(s.paperId)).toBeNull();
    expect((await readiness(s.paperId)).requiredActions).toEqual([]);
  });

  it('PU-154 several problems at once (missing, stale, orphan) → one 400 carrying all of them', async () => {
    const s = await purchaseScene(ctx, { products: [{}, {}, {}] });
    const [, p1, p2] = s.products;
    const r0 = await api.save(
      s.paperId,
      [await E(s, 10, p1), await E(s, 10, p2)],
      null,
    );
    expect(r0.status, body(r0)).toBe(200);
    await setAllocQty(
      ctx,
      (await allocRow(ctx, s.paperId, s.v1.id, p1.id))!.id,
      8,
    );
    await ctx.db.vehicle_allocation.delete({
      where: { id: (await allocRow(ctx, s.paperId, s.v1.id, p2.id))!.id },
    });
    const r = await rejection(s.paperId);
    expect([r!.missing.length, r!.stale.length, r!.orphans.length]).toEqual([
      1, 1, 1,
    ]);
    expect(r!.details).toHaveLength(3);
  });

  it('PU-155 a critical shortfall does not block', async () => {
    const s = await purchaseScene(ctx);
    expect((await api.save(s.paperId, [await E(s, 2)], null)).status).toBe(200);
    expect(await rejection(s.paperId)).toBeNull();
  });

  it('PU-156 re-finalize of a REOPENED paper runs the Purchase gate; finalizing a MORNING_SUBMITTED paper does not', async () => {
    const s = await purchaseScene(ctx, { status: 'REOPENED' });
    const reopened = await readiness(s.paperId);
    expect(reopened.action).toBe('FINALIZE');
    expect(
      purchaseProblems(reopened).some((p) => p.startsWith('Purchase missing:')),
    ).toBe(true);
    await ctx.setStatus(s.sheet, 'MORNING_SUBMITTED');
    const submitted = await readiness(s.paperId);
    expect(submitted.action).toBe('FINALIZE');
    expect(purchaseProblems(submitted)).toEqual([]);
  });

  it('PU-157 night submit calls no Purchase gate; DRAFT readiness has no Purchase problem', async () => {
    const s = await purchaseScene(ctx, { status: 'DRAFT' });
    const ready = await readiness(s.paperId);
    expect(ready.action).toBe('SUBMIT_NIGHT');
    expect(purchaseProblems(ready)).toEqual([]);
  });

  it('PU-138 readiness: DRAFT with no allocation → warning only; NIGHT_SUBMITTED → requiredActions and a problem', async () => {
    const s = await purchaseScene(ctx, { alloc: 0, status: 'DRAFT' });
    const draft = await readiness(s.paperId);
    expect(
      draft.warnings.some((w) =>
        w.startsWith('Purchase: no vehicle allocation exists yet'),
      ),
    ).toBe(true);
    expect(draft.requiredActions).toEqual([]);
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    const night = await readiness(s.paperId);
    expect(night.requiredActions).toEqual(['SIGN_OFF_ZERO_ALLOCATION']);
    expect(purchaseProblems(night).length).toBeGreaterThan(0);
  });

  it('PU-158 a MORNING allocation changed after the MORNING purchase was saved makes it stale and blocks; NIGHT cannot go stale this way', async () => {
    const t = await twoSessionPurchaseScene(ctx);
    const entries = [
      await pe(ctx, t.paperId, t.v, t.dist, t.p, t.qn),
      await pe(ctx, t.paperId, t.v, t.dist, t.p, t.qm, { session: 'MORNING' }),
    ];
    expect((await api.save(t.paperId, entries, null)).status).toBe(200);
    await expect(
      gate.validatePurchasesComplete(t.paperId, ctx.prisma as never),
    ).resolves.toBeUndefined();
    const va = vaApi(ctx);
    const morning = await va.save(
      t.paperId,
      [al(t.v, t.dist, t.p, 6)],
      await vaToken(ctx, t.paperId, 'MORNING'),
      { session: 'MORNING' },
    );
    expect(morning.status, body(morning)).toBe(200);
    const r = await rejection(t.paperId);
    expect(r!.stale).toHaveLength(1);
    expect(r!.stale[0]).toContain('MORNING');
    // the NIGHT allocation is locked once night is submitted, so its purchase cannot be made stale this way
    const night = await va.save(
      t.paperId,
      [al(t.v, t.dist, t.p, 3)],
      await vaToken(ctx, t.paperId, 'NIGHT'),
      { session: 'NIGHT' },
    );
    expect(night.status).toBe(400);
  });

  void [addVehicle, puToken];
});
