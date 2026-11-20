/**
 * Client Trays – administrative range recalculation (POST /client-trays/recalculate).
 * Scenarios: T-90 .. T-96   (spec: CT-11.1 .. 11.5, CT-10.6)
 * Papers use sale dates in 2097 so no other paper can fall inside the tested ranges.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  m,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addDays,
  cleanupTrayTests,
  outboxOf,
  seedLedger,
  submittedWithTrays,
  traysApi,
  trayToken,
  tt,
  utc,
  ymd,
} from '../../../../test/helper/client-trays-helpers.js';
import { ClientTraysPropagationService } from './services/client-trays-propagation.service.js';

describe('Client Trays range recalculation', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = traysApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  const D1 = utc(2097, 3, 10);
  const D2 = utc(2097, 3, 12);
  const body = (r: { body: any }) => JSON.stringify(r.body);

  it('T-90 ADMIN, valid range with papers → { papersQueued, fromDate, toDate, operations }; one outbox row per paper (200)', async () => {
    const a = await ctx.world.scene({ saleDate: D1 });
    const b = await ctx.world.scene({ saleDate: D2 });
    const res = await api.recalc(ymd(D1), ymd(D2));
    expect(res.status, body(res)).toBe(200);
    expect(res.body).toMatchObject({
      papersQueued: 2,
      fromDate: ymd(D1),
      toDate: ymd(D2),
    });
    expect(res.body.operations).toEqual([
      { paperId: a.sheet.paperId, operationId: expect.any(Number) },
      { paperId: b.sheet.paperId, operationId: expect.any(Number) },
    ]);
    for (const op of res.body.operations as {
      paperId: number;
      operationId: number;
    }[]) {
      const row = await ctx.db.propagation_outbox.findUniqueOrThrow({
        where: { id: op.operationId },
      });
      expect(row).toMatchObject({
        type: 'CLIENT_TRAYS_FORWARD',
        paper_id: op.paperId,
        status: 'PENDING',
      });
    }
  });

  it('T-91 bad shape, impossible date, fromDate after toDate → 400; nothing queued', async () => {
    const s = await ctx.world.scene({ saleDate: D1 });
    const cases: [string, string][] = [
      ['2097-3-10', '2097-03-12'],
      ['2097-03-10', 'abc'],
      ['2097-02-31', '2097-03-12'],
      ['2097-03-12', '2097-03-10'],
    ];
    for (const [from, to] of cases) {
      expect((await api.recalc(from, to)).status, `${from}..${to}`).toBe(400);
    }
    expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(0);
  });

  it('T-92 31 days inclusive accepted; 32 days → 400 "The date range cannot exceed 31 days"', async () => {
    expect((await api.recalc('2000-01-01', '2000-01-31')).status).toBe(200);
    const res = await api.recalc('2000-01-01', '2000-02-01');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      'The date range cannot exceed 31 days',
    );
  });

  it('T-93 a range with no papers → 200, papersQueued 0, empty operations', async () => {
    const res = await api.recalc('2000-01-01', '2000-01-05');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ papersQueued: 0, operations: [] });
  });

  it('T-94 FINALIZED papers are queued without reopening; later sheets outside the range are refreshed by the job', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5, saleDate: D1 });
    const [c] = s.clients;
    const outside = await ctx.world.newSheet({
      group: s.group,
      saleDate: addDays(D1, 5),
    });
    await seedLedger(ctx, outside.sheetId, c.id, tt(ctx), {
      opening: 0,
      taken: 2,
      returned: 1,
      closing: 1,
    });
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 5)]); // FINALIZED is delivered-based
    await ctx.setStatus(s.sheet, 'FINALIZED');

    const res = await api.recalc(ymd(D1), ymd(D1));
    expect(res.status, body(res)).toBe(200);
    expect(res.body.papersQueued).toBe(1);
    expect(
      (
        await ctx.db.order_paper.findUniqueOrThrow({
          where: { id: s.sheet.paperId },
        })
      ).status,
    ).toBe('FINALIZED');

    // [service seam] the queue is stubbed: run the job body the outbox row stands for.
    const propagation = ctx.app.get(ClientTraysPropagationService, {
      strict: false,
    });
    await ctx.prisma.$transaction((tx) =>
      propagation.propagateFromPaperChunk(
        s.sheet.paperId,
        null,
        20,
        tx as never,
      ),
    );
    const row = (
      await ctx.db.client_tray_transaction.findMany({
        where: { order_sheet_id: outside.sheetId },
      })
    )[0];
    expect(row).toMatchObject({
      opening_balance: 5,
      trays_taken: 2,
      trays_returned: 1,
      closing_balance: 6,
    });
  });

  it('T-95 the same paper requested twice while the first row is PENDING → same operationId, no new row (CT-10.6)', async () => {
    const s = await ctx.world.scene({ saleDate: D1 });
    const a = await api.recalc(ymd(D1), ymd(D1));
    const b = await api.recalc(ymd(D1), ymd(D1));
    expect(b.body.operations[0].operationId).toBe(
      a.body.operations[0].operationId,
    );
    expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(1);
  });

  it('T-96 [backend part] a range recalculation touches no sheet token (an open screen is not made stale)', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5, saleDate: D1 });
    const tray = await api.save(
      s.sheet.sheetId,
      [
        {
          clientId: s.clients[0].id,
          trayTypeId: tt(ctx),
          category: 'MILK',
          returned: 1,
        },
      ],
      null,
    );
    expect(tray.status).toBe(200);
    const before = await trayToken(ctx, s.sheet.sheetId);
    expect((await api.recalc(ymd(D1), ymd(D1))).status).toBe(200);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBe(before);
    expect(await ctx.tokenOf(s.sheet.sheetId)).not.toBeUndefined();
  });
});
