/**
 * Purchase – dairy tray side effects.
 * Scenarios: PU-118, PU-125 .. PU-128   (spec: PD-19, PD-28, DT-6.4, DT-6.5, DT-10.1, DT-10.2)
 * PU-128 depends on Dairy Trays behavior (DT-10.2) that is only specified, not visible in the files provided:
 * highest risk of a test-side mismatch.
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
  addDays,
  cleanupPuTests,
  dairyRows,
  pe,
  puApi,
  puEntries,
  puToken,
  purchaseScene,
} from '../../../../test/helper/purchase-helpers.js';
import { PurchaseModule } from './purchase.module.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';

describe('Purchase and dairy trays', () => {
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
  const takenOf = async (paperId: number) =>
    (await dairyRows(ctx, paperId)).reduce((n, r) => n + r.trays_taken, 0);

  it('PU-125a three purchases of 0.4 crates for one vehicle, session and tray type → 1 tray; billing unaffected', async () => {
    const s = await purchaseScene(ctx, {
      qty: 0.4,
      products: [{ tray: true }, { tray: true }, { tray: true }],
    });
    const r = await api.save(
      s.paperId,
      await Promise.all(s.products.map((p) => E(s, 0.4, p))),
      null,
    );
    expect(r.status, body(r)).toBe(200);
    const rows = await dairyRows(ctx, s.paperId);
    expect(rows).toHaveLength(1);
    expect(rows[0].trays_taken).toBe(1);
    for (const e of await puEntries(ctx, s.paperId))
      expect(num(e.purchase_amount)).toBe(268.8);
  });

  it('PU-125b 10.5 crates → 11 trays (half-up)', async () => {
    const s = await purchaseScene(ctx, {
      qty: 10.5,
      products: [{ tray: true }],
    });
    const r = await api.save(s.paperId, [await E(s, 10.5)], null);
    expect(r.status, body(r)).toBe(200);
    expect(await takenOf(s.paperId)).toBe(11);
  });

  it('PU-126a a no-op save does not recalculate dairy trays', async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    await api.save(s.paperId, [await E(s, 4)], null);
    const spy = vi.spyOn(DependencyOrchestratorService.prototype, 'execute');
    const r = await api.save(
      s.paperId,
      [await E(s, 4)],
      await puToken(ctx, s.paperId),
    );
    expect(r.body.changed).toBe(false);
    expect(spy.mock.calls.filter((c) => c[0] === 'PURCHASE')).toHaveLength(0);
  });

  /** Saves 10, then stores a dairy return of 10 against the resulting ledger line. */
  const withDairyReturn = async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    expect((await api.save(s.paperId, [await E(s, 10)], null)).status).toBe(
      200,
    );
    expect(await takenOf(s.paperId)).toBe(10);
    await ctx.db.dairy_tray_transaction.updateMany({
      where: {
        dairy_tray_paper_id: (
          await ctx.db.dairy_tray_paper.findUniqueOrThrow({
            where: { order_paper_id: s.paperId },
          })
        ).id,
      },
      data: { trays_returned: 10, closing_balance: 0 },
    });
    return s;
  };

  it('PU-127a lowering a purchase below a stored dairy return → 409; the Purchase write is rolled back', async () => {
    const s = await withDairyReturn();
    const t = await puToken(ctx, s.paperId);
    const r = await api.save(s.paperId, [await E(s, 5)], t);
    expect(r.status, body(r)).toBe(409);
    expect(num((await puEntries(ctx, s.paperId))[0].purchased_qty)).toBe(10);
    expect(await puToken(ctx, s.paperId)).toBe(t);
  });

  it('PU-118 / PU-127b deleting a purchase that would leave a dairy return above its balance → 409; deletion rolled back', async () => {
    const s = await withDairyReturn();
    const id = (await puEntries(ctx, s.paperId))[0].id;
    const r = await api.save(s.paperId, [], await puToken(ctx, s.paperId), {
      extra: { deletedEntryIds: [id] },
    });
    expect(r.status, body(r)).toBe(409);
    expect(await puEntries(ctx, s.paperId)).toHaveLength(1);
  });

  /** Later paper whose dairy ledger carries opening 10 and a return of 10 for the same vehicle, session, tray type. */
  const laterPaperWithReturn = async (s: Sc) => {
    const later = await ctx.world.newSheet({
      saleDate: addDays(s.sheet.saleDate, 1),
    });
    const h = await ctx.db.dairy_tray_paper.create({
      data: { order_paper_id: later.paperId },
    });
    await ctx.db.dairy_tray_transaction.create({
      data: {
        dairy_tray_paper_id: h.id,
        vehicle_id: s.v1.id,
        tray_type_id: ctx.world.brandTray.trayTypeId!,
        delivery_session: 'NIGHT',
        opening_balance: 10,
        trays_taken: 0,
        trays_returned: 10,
        closing_balance: 0,
      },
    });
  };

  it('PU-128a REOPENED paper: the check also covers later papers → 409', async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    expect((await api.save(s.paperId, [await E(s, 10)], null)).status).toBe(
      200,
    );
    await laterPaperWithReturn(s);
    await ctx.setStatus(s.sheet, 'REOPENED');
    const r = await api.save(
      s.paperId,
      [await E(s, 5)],
      await puToken(ctx, s.paperId),
    );
    expect(r.status, body(r)).toBe(409);
    expect(num((await puEntries(ctx, s.paperId))[0].purchased_qty)).toBe(10);
  });

  it('PU-128b NIGHT_SUBMITTED paper: only the current paper is checked; later papers pick it up at finalize → 200', async () => {
    const s = await purchaseScene(ctx, { products: [{ tray: true }] });
    expect((await api.save(s.paperId, [await E(s, 10)], null)).status).toBe(
      200,
    );
    await laterPaperWithReturn(s);
    const r = await api.save(
      s.paperId,
      [await E(s, 5)],
      await puToken(ctx, s.paperId),
    );
    expect(r.status, body(r)).toBe(200);
  });
});
