/**
 * Purchase – explicit deletion, purgeAll, tray re-evaluation.
 * Scenarios: PU-110 .. PU-121   (spec: PD-5, PD-6, PD-8, PD-9, PD-10, PD-25, PD-33..PD-35, PD-69, PD-73)
 * PU-118 (dairy return conflict on delete) lives in purchase.scenario.dairy.spec.ts.
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
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  allocRow,
  cleanupPuTests,
  dairyRows,
  pe,
  puApi,
  puEntries,
  puPaper,
  puToken,
  purchaseScene,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';

describe('Purchase deletion, purge and tray re-evaluation', () => {
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
  const tok = (s: Sc) => puToken(ctx, s.paperId);
  const saved = async (s: Sc, qty = 4) => {
    const r = await api.save(s.paperId, [await E(s, qty)], null);
    expect(r.status, body(r)).toBe(200);
    return (await puEntries(ctx, s.paperId))[0];
  };
  const logged = (spy: { mock: { calls: unknown[][] } }, action: string) =>
    spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes(action));

  it('PU-110 deletedEntryIds of this paper → deleted, ids returned, log line with userId, dairy recalculated', async () => {
    const s = await purchaseScene(ctx);
    const e = await saved(s);
    const log = vi.spyOn(Logger.prototype, 'log');
    const orch = vi.spyOn(DependencyOrchestratorService.prototype, 'execute');
    const r = await api.save(s.paperId, [], await tok(s), {
      extra: { deletedEntryIds: [e.id], reason: 'cleanup' },
    });
    expect(r.status, body(r)).toBe(200);
    expect(r.body).toMatchObject({ changed: true, deletedEntryIds: [e.id] });
    expect(await puEntries(ctx, s.paperId)).toHaveLength(0);
    const lines = logged(log, 'PURCHASE_DELETE_ENTRIES');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`"userId":${ctx.users.emp.id}`);
    expect(orch.mock.calls.some((c) => c[0] === 'PURCHASE')).toBe(true);
  });

  it('PU-111 an id that is not on this paper → 400; nothing deleted', async () => {
    const s = await purchaseScene(ctx);
    const other = await purchaseScene(ctx);
    await saved(s);
    const foreign = await saved(other);
    const r = await api.save(s.paperId, [], await tok(s), {
      extra: { deletedEntryIds: [foreign.id] },
    });
    expect(r.status).toBe(400);
    expect(body(r)).toContain('do not belong to this paper');
    expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
    expect(await puEntries(ctx, other.paperId)).toHaveLength(1);
  });

  it('PU-112 duplicate ids in deletedEntryIds → 400', async () => {
    const s = await purchaseScene(ctx);
    const e = await saved(s);
    const r = await api.save(s.paperId, [], await tok(s), {
      extra: { deletedEntryIds: [e.id, e.id] },
    });
    expect(r.status).toBe(400);
    expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
  });

  it('PU-113 an orphan is resolved by explicit deletion', async () => {
    const s = await purchaseScene(ctx);
    const e = await saved(s);
    await ctx.db.vehicle_allocation.delete({
      where: { id: (await allocRow(ctx, s.paperId, s.v1.id, s.p.id))!.id },
    });
    expect((await api.get(s.paperId)).body.orphanedEntries).toHaveLength(1);
    const r = await api.save(s.paperId, [], await tok(s), {
      extra: { deletedEntryIds: [e.id] },
    });
    expect(r.status, body(r)).toBe(200);
    expect((await api.get(s.paperId)).body.orphanedEntries).toEqual([]);
  });

  it('PU-114 an EMPLOYEE may delete a fresh, non-stale, non-orphan entry without a reason (PD-73)', async () => {
    const s = await purchaseScene(ctx);
    const e = await saved(s);
    const r = await api.save(s.paperId, [], await tok(s), {
      extra: { deletedEntryIds: [e.id] },
      token: ctx.tokens.emp,
    });
    expect(r.status, body(r)).toBe(200);
    expect(await puEntries(ctx, s.paperId)).toHaveLength(0);
  });

  it('PU-115 ADMIN purgeAll with scope PAPER deletes every entry of the paper, orphans included; logged', async () => {
    const s = await purchaseScene(ctx, { products: [{}, {}] });
    const r0 = await api.save(
      s.paperId,
      [await E(s, 4, s.products[0]), await E(s, 5, s.products[1])],
      null,
    );
    expect(r0.status, body(r0)).toBe(200);
    await ctx.db.vehicle_allocation.delete({
      where: {
        id: (await allocRow(ctx, s.paperId, s.v1.id, s.products[1].id))!.id,
      },
    });
    const log = vi.spyOn(Logger.prototype, 'log');
    const r = await api.save(s.paperId, [], await tok(s), {
      token: ctx.tokens.admin,
      extra: { purgeAll: true, purgeScope: 'PAPER' },
    });
    expect(r.status, body(r)).toBe(200);
    expect(r.body.deletedEntryIds).toHaveLength(2);
    expect(await puEntries(ctx, s.paperId)).toHaveLength(0);
    expect(logged(log, 'PURCHASE_PURGE_ALL')).toHaveLength(1);
  });

  it('PU-116 purgeAll without scope, or combined with entries / deletedEntryIds / reevaluateTrays → 400', async () => {
    const s = await purchaseScene(ctx);
    const e = await saved(s);
    const admin = { token: ctx.tokens.admin };
    const t = await tok(s);
    const noScope = await api.save(s.paperId, [], t, {
      ...admin,
      extra: { purgeAll: true },
    });
    expect(noScope.status).toBe(400);
    for (const [name, entries, extra] of [
      ['entries', [await E(s, 5)], {}],
      ['deletedEntryIds', [], { deletedEntryIds: [e.id] }],
      ['reevaluateTrays', [], { reevaluateTrays: true }],
    ] as const) {
      const r = await api.save(s.paperId, entries as unknown[], t, {
        ...admin,
        extra: { purgeAll: true, purgeScope: 'PAPER', ...extra },
      });
      expect(r.status, name).toBe(400);
      expect(body(r)).toContain('purgeAll cannot be combined');
    }
    expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
  });

  it('PU-117 purgeAll when nothing is saved → changed false', async () => {
    const s = await purchaseScene(ctx);
    const r = await api.save(s.paperId, [], null, {
      token: ctx.tokens.admin,
      extra: { purgeAll: true, purgeScope: 'PAPER' },
    });
    expect(r.status, body(r)).toBe(200);
    expect(r.body.changed).toBe(false);
  });

  it('PU-119 ADMIN reevaluateTrays re-resolves tray types, logs the change, recalculates dairy; a repeat changes nothing', async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    await saved(s);
    await ctx.db.purchase_entry.updateMany({
      where: { vehicle_id: s.v1.id },
      data: { tray_type_id: null },
    });
    const log = vi.spyOn(Logger.prototype, 'log');
    const admin = { token: ctx.tokens.admin };
    const r = await api.save(s.paperId, [], await tok(s), {
      ...admin,
      extra: { reevaluateTrays: true, reason: 'rules fixed' },
    });
    expect(r.status, body(r)).toBe(200);
    expect(r.body.changed).toBe(true);
    expect((await puEntries(ctx, s.paperId))[0].tray_type_id).toBe(
      ctx.world.brandTray.trayTypeId,
    );
    expect(logged(log, 'PURCHASE_TRAY_REEVALUATION')).toHaveLength(1);
    expect((await dairyRows(ctx, s.paperId)).length).toBeGreaterThan(0);
    const again = await api.save(s.paperId, [], await tok(s), {
      ...admin,
      extra: { reevaluateTrays: true },
    });
    expect(again.body.changed).toBe(false);
  });

  it('PU-120 reevaluateTrays together with entries is allowed', async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    await saved(s);
    const r = await api.save(s.paperId, [await E(s, 6)], await tok(s), {
      token: ctx.tokens.admin,
      extra: { reevaluateTrays: true },
    });
    expect(r.status, body(r)).toBe(200);
  });

  it('PU-121 product with no matching tray rule → no tray type, no dairy ledger line', async () => {
    const s = await purchaseScene(ctx, { products: [{}] });
    await saved(s);
    expect((await puEntries(ctx, s.paperId))[0].tray_type_id).toBeNull();
    expect(await dairyRows(ctx, s.paperId)).toHaveLength(0);
    expect(await puPaper(ctx, s.paperId)).not.toBeNull();
  });
});
