/**
 * Dairy Trays: Purchase-driven recalculation, reopened saves, cascade and range jobs.
 * Scenarios DY-80 to DY-86, DY-90 to DY-93, DY-96, DY-98 and DY-104 to DY-106
 * (behavioral spec sections C6, C7, C8). Admin reconcile (DY-100 to DY-103) is in the admin spec.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import { DairyTraysPropagationService } from './services/dairy-trays-propagation.service.js';
import {
  DT_DISCREPANCY,
  STALE_DT,
  buyTrays,
  cleanupDtTests,
  dairyRows,
  dtApi,
  dtHeader,
  dtPaper,
  dtRow,
  dtToken,
  forwardJobs,
  ledgerScene,
  re,
  rebuildLedger,
  saleDateOf,
  seedDairyLine,
  vname,
} from '../../../../test/helper/dairy-trays-helpers.js';
import {
  addDays,
  pe,
  puApi,
  puToken,
  purchaseScene,
} from '../../../../test/helper/purchase-helpers.js';

const text = (r: { body: unknown }) => JSON.stringify(r.body);

let ctx: OrdersCtx;
let dt: ReturnType<typeof dtApi>;
beforeAll(async () => {
  ctx = await createOrdersTestContext({ modules: [DairyTraysModule] });
  dt = dtApi(ctx);
});
afterAll(() => ctx.close());
afterEach(() => cleanupDtTests(ctx));

// ---------------------------------------------------------------------------
// Purchase-driven scene: a tray product allocated and purchasable on a paper (status default NIGHT_SUBMITTED)
// ---------------------------------------------------------------------------
async function purchaseTrayScene(status = 'NIGHT_SUBMITTED', qty = 10) {
  const s = await purchaseScene(ctx, {
    qty,
    products: [{ tray: true }],
    status,
  });
  const trayTypeId = ctx.world.brandTray.trayTypeId!;
  const header = await ctx.db.dairy_tray_paper.findUnique({
    where: { order_paper_id: s.paperId },
  });
  expect(header).not.toBeNull();
  return { ...s, trayTypeId };
}
type PScene = Awaited<ReturnType<typeof purchaseTrayScene>>;

/** Saves the purchase quantity of the scene's vehicle through the real Purchase API. */
async function purchaseQty(s: PScene, qty: number) {
  await ctx.db.purchase_paper.upsert({
    where: { order_paper_id: s.paperId },
    update: {},
    create: { order_paper_id: s.paperId },
  });
  return puApi(ctx).save(
    s.paperId,
    [await pe(ctx, s.paperId, s.v1, s.dist, s.p, qty)],
    await puToken(ctx, s.paperId),
  );
}
const dairyToken = (s: { paperId: number }) => dtToken(ctx, s.paperId);

async function returnTrays(
  s: { paperId: number; v1: { id: number }; trayTypeId: number },
  returned: number,
) {
  const r = await dt.save(
    s.paperId,
    [re(s.v1, s.trayTypeId, returned)],
    await dairyToken(s),
  );
  expect(r.status, text(r)).toBe(200);
}

describe('DY-80 to DY-86 Purchase-driven recalculation', () => {
  it('DY-80 a: a Purchase save that changes entries recalculates the ledger; returns are kept exactly; the token advances', async () => {
    const s = await purchaseTrayScene();
    const tokenBefore = await dairyToken(s);
    let r = await purchaseQty(s, 10);
    expect(r.status, text(r)).toBe(200);
    expect(await dtRow(ctx, s.paperId, s.v1, s.trayTypeId)).toMatchObject({
      opening_balance: 0,
      trays_taken: 10,
      closing_balance: 10,
    });
    expect(await dairyToken(s)).not.toBe(tokenBefore);

    await returnTrays(s, 4);
    r = await purchaseQty(s, 8);
    expect(r.status, text(r)).toBe(200);
    expect(await dtRow(ctx, s.paperId, s.v1, s.trayTypeId)).toMatchObject({
      trays_taken: 8,
      trays_returned: 4,
      closing_balance: 4,
    });
  });

  it('DY-80 b: the dairy header is created when it is missing', async () => {
    const s = await purchaseTrayScene();
    await ctx.db.dairy_tray_paper.delete({
      where: { order_paper_id: s.paperId },
    });
    const r = await purchaseQty(s, 6);
    expect(r.status, text(r)).toBe(200);
    expect(await dtHeader(ctx, s.paperId)).not.toBeNull();
    expect((await dairyRows(ctx, s.paperId))[0].trays_taken).toBe(6);
  });

  it('DY-81: a Purchase no-op save does not recalculate and leaves the dairy token unchanged', async () => {
    const s = await purchaseTrayScene();
    expect((await purchaseQty(s, 10)).status).toBe(200);
    const token = await dairyToken(s);
    const rows = JSON.stringify(await dairyRows(ctx, s.paperId));
    const again = await purchaseQty(s, 10);
    expect(again.status, text(again)).toBe(200);
    expect(await dairyToken(s)).toBe(token);
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(rows);
  });

  it('DY-82: a Purchase save that lowers the quantity below a stored return is 409 with details, and the Purchase write is rolled back', async () => {
    const s = await purchaseTrayScene();
    expect((await purchaseQty(s, 10)).status).toBe(200);
    await returnTrays(s, 8);
    const purchaseBefore = await ctx.db.purchase_entry.findMany({
      where: { vehicle_id: s.v1.id },
    });
    const dairyBefore = JSON.stringify(await dairyRows(ctx, s.paperId));

    const r = await purchaseQty(s, 5);
    expect(r.status, text(r)).toBe(409);
    expect(r.body.message).toBe(DT_DISCREPANCY);
    const details = (r.body.details as string[]).join('\n');
    expect(details).toContain(vname(s.v1));
    expect(details).toContain('8');
    expect(details).toContain('5 outstanding');

    const purchaseAfter = await ctx.db.purchase_entry.findMany({
      where: { vehicle_id: s.v1.id },
    });
    expect(purchaseAfter.map((x) => Number(x.purchased_qty))).toEqual(
      purchaseBefore.map((x) => Number(x.purchased_qty)),
    );
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(dairyBefore);
  });

  it('DY-84: REOPENED paper, Purchase correction: later papers are checked (409 on conflict); no cascade is queued on success', async () => {
    const s = await purchaseTrayScene('REOPENED');
    expect((await purchaseQty(s, 10)).status).toBe(200);
    const later = await ctx.world.newSheet({
      saleDate: addDays(s.sheet.saleDate, 1),
    });
    // the later paper holds a return of 5 that needs a closing of at least 5 on this paper
    await seedDairyLine(ctx, later.paperId, s.v1, s.trayTypeId, {
      opening: 10,
      taken: 0,
      returned: 5,
    });

    const conflict = await purchaseQty(s, 4);
    expect(conflict.status, text(conflict)).toBe(409);
    expect(await forwardJobs(ctx, s.paperId)).toHaveLength(0);

    const ok = await purchaseQty(s, 8); // within the allocation of 10
    expect(ok.status, text(ok)).toBe(200);
    expect(await forwardJobs(ctx, s.paperId)).toHaveLength(0);
  });

  it('DY-85: NIGHT_SUBMITTED paper, Purchase correction: current paper only; later papers are not touched or checked', async () => {
    const s = await purchaseTrayScene('NIGHT_SUBMITTED');
    expect((await purchaseQty(s, 10)).status).toBe(200);
    const later = await ctx.world.newSheet({
      saleDate: addDays(s.sheet.saleDate, 1),
    });
    await seedDairyLine(ctx, later.paperId, s.v1, s.trayTypeId, {
      opening: 10,
      taken: 0,
      returned: 10,
    });
    const laterBefore = JSON.stringify(await dairyRows(ctx, later.paperId));

    const r = await purchaseQty(s, 5);
    expect(r.status, text(r)).toBe(200);
    expect(JSON.stringify(await dairyRows(ctx, later.paperId))).toBe(
      laterBefore,
    );
    expect(await forwardJobs(ctx, s.paperId)).toHaveLength(0);
  });

  it("DY-86: a Purchase change of Taken advances the dairy token, so the open Dairy screen's next save is 409", async () => {
    const s = await purchaseTrayScene();
    expect((await purchaseQty(s, 10)).status).toBe(200);
    const stale = (await dairyToken(s))!;
    expect((await purchaseQty(s, 9)).status).toBe(200);
    expect(await dairyToken(s)).not.toBe(stale);

    const r = await dt.save(s.paperId, [re(s.v1, s.trayTypeId, 1)], stale);
    expect(r.status).toBe(409);
    expect(text(r)).toContain(STALE_DT);
  });
});

describe('DY-90 and DY-91 saves on REOPENED and NIGHT_SUBMITTED papers', () => {
  /** Paper 0 with 10 trays; a later paper holds a stored return of `laterReturn`, covered by the opening of 10. */
  async function withLaterReturn(status: string, laterReturn: number) {
    const a = await ledgerScene(ctx, { k: 0, qty: 10, status });
    const later = await dtPaper(ctx, 1);
    await seedDairyLine(ctx, later.paperId, a.v, a.trayTypeId, {
      opening: 10,
      taken: 0,
      returned: laterReturn,
    });
    return { a, later };
  }

  it('DY-90 a: a REOPENED save that would leave a later paper above its balance is 409 and saves nothing', async () => {
    const { a } = await withLaterReturn('REOPENED', 10);
    const before = JSON.stringify(await dairyRows(ctx, a.paperId));
    const token = await a.token();
    const r = await dt.save(a.paperId, [re(a.v, a.trayTypeId, 1)], token);
    expect(r.status, text(r)).toBe(409);
    expect(r.body.message).toBe(DT_DISCREPANCY);
    expect(JSON.stringify(await dairyRows(ctx, a.paperId))).toBe(before);
    expect(await a.token()).toBe(token);
    expect(await forwardJobs(ctx, a.paperId)).toHaveLength(0);
  });

  it('DY-90 b: a REOPENED save that fits later papers succeeds and queues one DAIRY_TRAYS_FORWARD row for the paper', async () => {
    const { a } = await withLaterReturn('REOPENED', 5);
    const r = await dt.save(
      a.paperId,
      [re(a.v, a.trayTypeId, 2)],
      await a.token(),
    );
    expect(r.status, text(r)).toBe(200);
    const jobs = await forwardJobs(ctx, a.paperId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('PENDING');
  });

  it('DY-91: a NIGHT_SUBMITTED save does no forward check and queues nothing', async () => {
    const { a } = await withLaterReturn('NIGHT_SUBMITTED', 10);
    const r = await dt.save(
      a.paperId,
      [re(a.v, a.trayTypeId, 1)],
      await a.token(),
    );
    expect(r.status, text(r)).toBe(200);
    expect(await forwardJobs(ctx, a.paperId)).toHaveLength(0);
  });
});

describe('DY-92, DY-93, DY-96, DY-98 cascade (real job body)', () => {
  it('DY-92: a cascade refreshes only opening and closing of later papers; creates carry-forward rows across gaps; updates FINALIZED papers without reopening', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    await returnTrays(
      { paperId: a.paperId, v1: a.v, trayTypeId: a.trayTypeId },
      4,
    );
    const gap = await dtPaper(ctx, 2, 'FINALIZED');
    const withRow = await dtPaper(ctx, 3, 'FINALIZED');
    await seedDairyLine(ctx, withRow.paperId, a.v, a.trayTypeId, {
      opening: 0,
      taken: 5,
      returned: 2,
    });

    await rebuildLedger(ctx, a.paperId);

    expect(await dtRow(ctx, gap.paperId, a.v, a.trayTypeId)).toMatchObject({
      opening_balance: 6,
      trays_taken: 0,
      trays_returned: 0,
      closing_balance: 6,
    });
    expect(await dtRow(ctx, withRow.paperId, a.v, a.trayTypeId)).toMatchObject({
      opening_balance: 6,
      trays_taken: 5,
      trays_returned: 2,
      closing_balance: 9,
    });
    for (const p of [gap, withRow])
      expect(
        (
          await ctx.db.order_paper.findUniqueOrThrow({
            where: { id: p.paperId },
          })
        ).status,
      ).toBe('FINALIZED');
  });

  it('DY-93: a cascade that changes nothing leaves later rows and tokens alone', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const later = await dtPaper(ctx, 1, 'FINALIZED');
    await rebuildLedger(ctx, a.paperId);
    const token = await dtToken(ctx, later.paperId);
    const rows = JSON.stringify(await dairyRows(ctx, later.paperId));

    await rebuildLedger(ctx, a.paperId);
    expect(await dtToken(ctx, later.paperId)).toBe(token);
    expect(JSON.stringify(await dairyRows(ctx, later.paperId))).toBe(rows);
  });

  it('DY-94 (409 part): a cascade that meets a return above its balance fails with the offenders listed', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    await returnTrays(
      { paperId: a.paperId, v1: a.v, trayTypeId: a.trayTypeId },
      4,
    );
    const later = await dtPaper(ctx, 1);
    await seedDairyLine(ctx, later.paperId, a.v, a.trayTypeId, {
      opening: 10,
      taken: 0,
      returned: 10,
    });

    const err: any = await rebuildLedger(ctx, a.paperId).then(
      () => null,
      (e) => e,
    );
    expect(err?.getStatus?.()).toBe(409);
    expect(JSON.stringify(err.getResponse())).toContain('10 ');
    expect(JSON.stringify(err.getResponse())).toContain('only 6 outstanding');
  });

  it('DY-96: the forward job works in chunks and resumes from the next paper', async () => {
    const svc = ctx.app.get(DairyTraysPropagationService, { strict: false });
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const l1 = await dtPaper(ctx, 1);
    const l2 = await dtPaper(ctx, 2);
    const l3 = await dtPaper(ctx, 3);

    const first = await ctx.prisma.$transaction((tx) =>
      svc.propagateFromPaperChunk(a.paperId, null, 2, tx),
    );
    expect(first).toEqual({ done: false, resumeFromPaperId: l2.paperId });
    expect(await dtRow(ctx, l1.paperId, a.v, a.trayTypeId)).not.toBeNull();
    expect(await dtRow(ctx, l2.paperId, a.v, a.trayTypeId)).toBeNull();

    const second = await ctx.prisma.$transaction((tx) =>
      svc.propagateFromPaperChunk(a.paperId, first.resumeFromPaperId!, 2, tx),
    );
    expect(second.done).toBe(true);
    for (const p of [l2, l3])
      expect(await dtRow(ctx, p.paperId, a.v, a.trayTypeId)).not.toBeNull();
  });

  it("DY-98: while a cascade is pending, a later paper's GET is still consistent because opening is live", async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    await returnTrays(
      { paperId: a.paperId, v1: a.v, trayTypeId: a.trayTypeId },
      6,
    );
    const later = await dtPaper(ctx, 1);
    await buyTrays(ctx, later, a.v, a.p, a.dist, 5);
    await rebuildLedger(ctx, later.paperId); // stored opening 4
    await returnTrays(
      { paperId: a.paperId, v1: a.v, trayTypeId: a.trayTypeId },
      2,
    ); // closing 8, later not cascaded

    const r = await dt.get(later.paperId);
    expect(
      r.body.rows.find((x: any) => x.vehicleId === a.v.id)[
        `tray_${a.trayTypeId}_opening`
      ],
    ).toBe(8);
    expect(
      (await dtRow(ctx, later.paperId, a.v, a.trayTypeId))!.opening_balance,
    ).toBe(4);
  });
});

describe('DY-104 to DY-106 range recalculation', () => {
  const day = (k: number) => saleDateOf(k).toISOString().slice(0, 10);

  it('DY-104: a valid range answers at once with the queued operations; one DAIRY_TRAYS_FORWARD row per paper', async () => {
    const p1 = await dtPaper(ctx, 20);
    const p2 = await dtPaper(ctx, 21);
    const r = await dt.recalc({ fromDate: day(20), toDate: day(21) });
    expect(r.status, text(r)).toBe(200);
    expect(r.body).toMatchObject({
      papersQueued: 2,
      fromDate: day(20),
      toDate: day(21),
    });
    expect(r.body.operations).toHaveLength(2);
    for (const p of [p1, p2]) {
      const jobs = await forwardJobs(ctx, p.paperId);
      expect(jobs).toHaveLength(1);
      expect(r.body.operations).toContainEqual({
        paperId: p.paperId,
        operationId: jobs[0].id,
      });
    }
  });

  it('DY-105: a range with no papers is papersQueued 0, operations []', async () => {
    const r = await dt.recalc({ fromDate: '2098-06-01', toDate: '2098-06-03' });
    expect(r.status, text(r)).toBe(200);
    expect(r.body).toMatchObject({ papersQueued: 0, operations: [] });
  });

  it('DY-106: the job body for a paper without a header creates it, rebuilds openings across gaps, adds carry-forward rows and recalculates FINALIZED papers', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    await returnTrays(
      { paperId: a.paperId, v1: a.v, trayTypeId: a.trayTypeId },
      4,
    );
    const target = await dtPaper(ctx, 3, 'FINALIZED', { header: false });
    await buyTrays(ctx, target, a.v, a.p, a.dist, 5);
    const carried = await dtPaper(ctx, 4, 'FINALIZED');

    expect(await dtHeader(ctx, target.paperId)).toBeNull();
    await rebuildLedger(ctx, target.paperId);

    expect(await dtHeader(ctx, target.paperId)).not.toBeNull();
    expect(await dtRow(ctx, target.paperId, a.v, a.trayTypeId)).toMatchObject({
      opening_balance: 6,
      trays_taken: 5,
      closing_balance: 11,
    });
    expect(await dtRow(ctx, carried.paperId, a.v, a.trayTypeId)).toMatchObject({
      opening_balance: 11,
      closing_balance: 11,
      trays_returned: 0,
    });
    expect(
      (
        await ctx.db.order_paper.findUniqueOrThrow({
          where: { id: target.paperId },
        })
      ).status,
    ).toBe('FINALIZED');
  });
});
