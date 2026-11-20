/**
 * Client Trays – recalculation and propagation.
 * Scenarios: T-70 .. T-82, T-154, T-155, T-156 (T-83 lives in client-trays.scenario.paper.spec.ts)
 * (spec: CT-6.3, CT-6.6, CT-8.6, CT-10.x, CT-11.5, CT-12.x, CT-14.4, OD-6.13, PA-6.3)
 *
 * The queue / relay are stubbed by the harness (no Redis). Where a scenario needs the background
 * job to run, the job body is invoked directly through the real service ([service seam]).
 */
import { UnrecoverableError } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  iso,
  m,
  n,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addDays,
  cell,
  cleanupTrayTests,
  leaves,
  outboxOf,
  ret,
  rowOf,
  seedLedger,
  setTrayActive,
  sheetWithOpening,
  submittedWithTrays,
  traysApi,
  tt,
  utc,
} from '../../../../test/helper/client-trays-helpers.js';
import { ClientTraysPropagationService } from './services/client-trays-propagation.service.js';
import { DairyTraysPropagationService } from '../dairy-trays/services/dairy-trays-propagation.service.js';
import { PropagationQueueService } from '../propagation-queue/propagation-queue.service.js';
import { PropagationQueueProcessor } from '../propagation-queue/propagation-queue.processor.js';
import { PropagationOutboxRepository } from '../propagation-queue/propagation-outbox.repository.js';
import { PROPAGATION_OUTBOX_STUCK_AFTER_MS } from '../propagation-queue/propagation-queue.constants.js';

describe('Client Trays recalculation and propagation', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  let propagation: ClientTraysPropagationService;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = traysApi(ctx);
    propagation = ctx.app.get(ClientTraysPropagationService, { strict: false });
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  const D = utc(2096, 5, 14);
  const body = (r: { body: any }) => JSON.stringify(r.body);
  const stored = (sheetId: number) => ctx.trayRows(sheetId);
  const rowsOn = (sheetId: number) =>
    ctx.db.client_tray_transaction.findMany({
      where: { order_sheet_id: sheetId },
      orderBy: { id: 'asc' },
    });
  const cascade = (
    startSheetId: number,
    chunk = 20,
    resume: number | null = null,
  ) =>
    ctx.prisma.$transaction((tx) =>
      propagation.cascadeForwardChunk(startSheetId, resume, chunk, tx as never),
    );
  const view = async (sheetId: number) => (await api.get(sheetId)).body;
  const later = (group: any, days: number) =>
    ctx.world.newSheet({ group, saleDate: addDays(D, days) });

  /** NIGHT_SUBMITTED sheet on D whose stored ledger closed at `qty`. */
  const base = (qty = 5, clients = 1) =>
    submittedWithTrays(ctx, { qty, clients, saleDate: D });

  it('T-70 an Orders save recalculates the ledger in the same transaction: opening, taken, returns preserved', async () => {
    const s = await sheetWithOpening(ctx, D, 3, 5, 'DRAFT');
    expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
      opening_balance: 3,
      trays_taken: 5,
      trays_returned: 0,
      closing_balance: 8,
    });
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    expect(
      (await api.save(s.sheet.sheetId, [ret(s.c.id, tt(ctx), 2)], null)).status,
    ).toBe(200);
    await ctx.seedMorning(s.sheet, [m(s.c, s.p, 4)]);
    expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
      opening_balance: 3,
      trays_taken: 4,
      trays_returned: 2,
      closing_balance: 5,
    });
  });

  it('T-71 an Orders save that would leave a stored return above its balance → 409 with details; whole Orders save rolled back', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const [c] = s.clients;
    expect(
      (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 5)], null)).status,
    ).toBe(200);
    const before = await ctx.tokenOf(s.sheet.sheetId);
    const res = await ctx.api.morning(
      s.sheet.sheetId,
      [m(c, s.products[0], 3)],
      before,
    );
    expect(res.status, body(res)).toBe(409);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details[0]).toContain(iso(s.sheet.saleDate));
    expect(res.body.details[0]).toContain(`client "${c.name}"`);
    expect(res.body.details[0]).toContain('returned but only 3 outstanding');
    expect(
      (await ctx.line(s.sheet.sheetId, c.id, s.products[0].id))!.delivered_qty,
    ).toBeNull();
    expect(await ctx.tokenOf(s.sheet.sheetId)).toBe(before);
    expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
      trays_taken: 5,
      trays_returned: 5,
      closing_balance: 0,
    });
  });

  it('T-72 REOPENED Orders correction that would strand a return on a later sheet → 409, nothing saved, no outbox row', async () => {
    const s = await base(5);
    const [c] = s.clients;
    const [p] = s.products;
    await ctx.seedMorning(s.sheet, [m(c, p, 5)]);
    await ctx.setStatus(s.sheet, 'REOPENED');
    const l = await later(s.group, 1);
    await seedLedger(ctx, l.sheetId, c.id, tt(ctx), {
      opening: 5,
      returned: 5,
      closing: 0,
    });
    const t = await ctx.tokenOf(s.sheet.sheetId);
    const res = await ctx.api.morning(s.sheet.sheetId, [m(c, p, 3)], t);
    expect(res.status, body(res)).toBe(409);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(
      Number((await ctx.line(s.sheet.sheetId, c.id, p.id))!.delivered_qty),
    ).toBe(5);
    expect(await ctx.tokenOf(s.sheet.sheetId)).toBe(t);
    expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(0);
  });

  it('T-73 REOPENED Orders correction, no conflict → sheet recalculated, one PENDING cascade row', async () => {
    const s = await base(5);
    const [c] = s.clients;
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 5)]);
    await ctx.setStatus(s.sheet, 'REOPENED');
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 3)]);
    expect((await stored(s.sheet.sheetId))[0].trays_taken).toBe(3);
    const outbox = await outboxOf(ctx, s.sheet.paperId);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
      resume_from_id: s.sheet.sheetId,
      status: 'PENDING',
    });
  });

  it('T-74 a return save on NIGHT_SUBMITTED runs no dry run and queues nothing', async () => {
    const s = await base(5);
    const res = await api.save(
      s.sheet.sheetId,
      [ret(s.clients[0].id, tt(ctx), 2)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(0);
  });

  describe('T-75 a return save on REOPENED', () => {
    const reopened = async () => {
      const s = await base(5);
      const [c] = s.clients;
      await ctx.seedMorning(s.sheet, [m(c, s.products[0], 5)]);
      await ctx.setStatus(s.sheet, 'REOPENED');
      return { s, c };
    };

    it('T-75a conflict on a later sheet → 409, nothing saved, no outbox row', async () => {
      const { s, c } = await reopened();
      const l = await later(s.group, 1);
      await seedLedger(ctx, l.sheetId, c.id, tt(ctx), {
        opening: 5,
        returned: 5,
        closing: 0,
      });
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        null,
      );
      expect(res.status, body(res)).toBe(409);
      expect(Array.isArray(res.body.details)).toBe(true);
      expect((await stored(s.sheet.sheetId))[0].trays_returned).toBe(0);
      expect(
        await ctx
          .sheetRow(s.sheet.sheetId)
          .then((r) => r.client_trays_updated_at),
      ).toBeNull();
      expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(0);
    });

    it('T-75b no conflict → saved and a cascade queued', async () => {
      const { s, c } = await reopened();
      const l = await later(s.group, 1);
      await seedLedger(ctx, l.sheetId, c.id, tt(ctx), {
        opening: 5,
        returned: 1,
        closing: 4,
      });
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      const outbox = await outboxOf(ctx, s.sheet.paperId);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({
        type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
        resume_from_id: s.sheet.sheetId,
        status: 'PENDING',
      });
    });
  });

  it('T-76 [service seam] a cascade refreshes opening/closing of later sheets, FINALIZED included; taken and returned untouched', async () => {
    const s = await base(5);
    const [c] = s.clients;
    const l = await later(s.group, 1);
    await seedLedger(ctx, l.sheetId, c.id, tt(ctx), {
      opening: 0,
      taken: 2,
      returned: 1,
      closing: 1,
    });
    await ctx.setStatus(l, 'FINALIZED');
    expect((await cascade(s.sheet.sheetId)).done).toBe(true);
    expect((await rowsOn(l.sheetId))[0]).toMatchObject({
      opening_balance: 5,
      trays_taken: 2,
      trays_returned: 1,
      closing_balance: 6,
    });
    expect(
      (await ctx.db.order_paper.findUniqueOrThrow({ where: { id: l.paperId } }))
        .status,
    ).toBe('FINALIZED');
  });

  it('T-77 [service seam] a cascade creates carry-forward lines (return 0) on later sheets, across gaps', async () => {
    const s = await base(5);
    const [c] = s.clients;
    const l1 = await later(s.group, 1);
    const l2 = await later(s.group, 2);
    await cascade(s.sheet.sheetId);
    for (const l of [l1, l2]) {
      const rows = await rowsOn(l.sheetId);
      expect(rows, `sheet ${l.sheetId}`).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        client_id: c.id,
        opening_balance: 5,
        trays_taken: 0,
        trays_returned: 0,
        closing_balance: 5,
      });
    }
  });

  describe('T-78 a cascade meeting a return above the balance fails, never caps', () => {
    const conflicted = async () => {
      const s = await base(2);
      const [c] = s.clients;
      const l = await later(s.group, 1);
      await seedLedger(ctx, l.sheetId, c.id, tt(ctx), {
        opening: 5,
        returned: 5,
        closing: 0,
      });
      return { s, c, l };
    };

    it('T-78a [service seam] 409 with details naming date, client and tray; nothing capped', async () => {
      const { s, c, l } = await conflicted();
      const err: any = await cascade(s.sheet.sheetId).then(
        () => null,
        (e) => e,
      );
      expect(err?.getStatus?.()).toBe(409);
      expect((err.getResponse() as { details: string[] }).details[0]).toContain(
        `client "${c.name}"`,
      );
      expect((err.getResponse() as { details: string[] }).details[0]).toContain(
        'returned but only 2 outstanding',
      );
      expect((await rowsOn(l.sheetId))[0].trays_returned).toBe(5);
    });

    it('T-78b [processor seam] job FAILED at once with details in last_error; after the returns are fixed an admin retry succeeds', async () => {
      const { s, l } = await conflicted();
      const repo = ctx.app.get(PropagationOutboxRepository, { strict: false });
      const processor = new PropagationQueueProcessor(
        propagation,
        ctx.app.get(DairyTraysPropagationService, { strict: false }),
        ctx.app.get(PropagationQueueService, { strict: false }),
        repo,
        ctx.prisma,
      );
      const row = await ctx.db.propagation_outbox.create({
        data: {
          type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
          paper_id: s.sheet.paperId,
          resume_from_id: s.sheet.sheetId,
          status: 'PROCESSING',
        },
      });
      const job = {
        id: 'T-78b',
        data: {
          type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
          startSheetId: s.sheet.sheetId,
          outboxId: row.id,
        },
        opts: { attempts: 5 },
        attemptsMade: 1,
      };

      const err: any = await processor.process(job as never).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(UnrecoverableError);
      expect(err.message).toContain('returned but only 2 outstanding');
      await processor.onJobFailed(job as never, err);
      const failed = await ctx.db.propagation_outbox.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(failed.status).toBe('FAILED');
      expect(failed.last_error).toContain('returned but only 2 outstanding');

      await ctx.db.client_tray_transaction.updateMany({
        where: { order_sheet_id: l.sheetId },
        data: { trays_returned: 1, closing_balance: 1 },
      });
      // [seam] the Paper module is not mounted in the harness: the admin retry endpoint calls this repository method
      expect(await repo.requeueFailedForPaper(s.sheet.paperId)).toBe(1);
      expect(
        (
          await ctx.db.propagation_outbox.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).status,
      ).toBe('PENDING');

      await processor.process(job as never);
      expect(
        (
          await ctx.db.propagation_outbox.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).status,
      ).toBe('DONE');
      expect((await rowsOn(l.sheetId))[0]).toMatchObject({
        opening_balance: 2,
        trays_returned: 1,
        closing_balance: 1,
      });
    });
  });

  it('T-79 [service seam] forward propagation of a paper recalculates its sheets, then cascades to later ones', async () => {
    // Part not covered: the finalize call that enqueues the CLIENT_TRAYS_FORWARD row needs a fully
    // finalizable paper (blocked, see coverage map). The job body is run directly.
    const s = await base(5);
    const [c] = s.clients;
    const l = await later(s.group, 1);
    await seedLedger(ctx, l.sheetId, c.id, tt(ctx), {
      opening: 0,
      taken: 0,
      returned: 0,
      closing: 0,
    });
    await ctx.db.client_tray_transaction.updateMany({
      where: { order_sheet_id: s.sheet.sheetId },
      data: { trays_taken: 1, closing_balance: 1 },
    });
    const res = await ctx.prisma.$transaction((tx) =>
      propagation.propagateFromPaperChunk(
        s.sheet.paperId,
        null,
        20,
        tx as never,
      ),
    );
    expect(res.done).toBe(true);
    expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
      trays_taken: 5,
      trays_returned: 0,
      closing_balance: 5,
    });
    expect((await rowsOn(l.sheetId))[0]).toMatchObject({
      opening_balance: 5,
      closing_balance: 5,
    });
  });

  it('T-80 [service seam] a chain longer than one chunk resumes without skipping; a rerun is idempotent', async () => {
    const s = await base(5);
    const chain: Awaited<ReturnType<typeof later>>[] = [];
    for (let i = 1; i <= 25; i++) chain.push(await later(s.group, i));
    const first = await cascade(s.sheet.sheetId, 20);
    expect(first).toEqual({
      done: false,
      resumeFromSheetId: chain[20].sheetId,
    });
    expect(
      await cascade(s.sheet.sheetId, 20, first.resumeFromSheetId!),
    ).toEqual({ done: true });
    const snapshot = async () =>
      Promise.all(
        chain.map(async (l) =>
          (await rowsOn(l.sheetId)).map(
            ({
              client_id,
              opening_balance,
              trays_taken,
              trays_returned,
              closing_balance,
            }) => ({
              client_id,
              opening_balance,
              trays_taken,
              trays_returned,
              closing_balance,
            }),
          ),
        ),
      );
    const done = await snapshot();
    for (const rows of done)
      expect(rows).toEqual([
        expect.objectContaining({ opening_balance: 5, closing_balance: 5 }),
      ]);
    const r1 = await cascade(s.sheet.sheetId, 20);
    await cascade(s.sheet.sheetId, 20, r1.resumeFromSheetId!);
    expect(await snapshot()).toEqual(done);
  }, 120000);

  describe('T-81 outbox reliability', () => {
    it('T-81a a row stuck in PROCESSING is re-queued', async () => {
      const s = await base(1);
      const repo = ctx.app.get(PropagationOutboxRepository, { strict: false });
      const row = await ctx.db.propagation_outbox.create({
        data: {
          type: 'CLIENT_TRAYS_FORWARD',
          paper_id: s.sheet.paperId,
          status: 'PROCESSING',
          updated_at: new Date(Date.now() - 3 * 60_000),
        },
      });
      expect(
        await repo.requeueStuckProcessing(PROPAGATION_OUTBOX_STUCK_AFTER_MS),
      ).toBeGreaterThanOrEqual(1);
      expect(
        (
          await ctx.db.propagation_outbox.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).status,
      ).toBe('PENDING');
    });

    it('T-81b two identical PENDING requests are merged', async () => {
      const s = await base(1);
      const repo = ctx.app.get(PropagationOutboxRepository, { strict: false });
      const enqueue = () =>
        ctx.prisma.$transaction((tx) =>
          repo.enqueue(
            'CLIENT_TRAYS_FORWARD',
            s.sheet.paperId,
            null,
            tx as never,
          ),
        );
      const a = await enqueue();
      const b = await enqueue();
      expect(b.id).toBe(a.id);
      expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(1);
    });
  });

  it('T-82 eventual consistency: until the cascade runs, a sheet two steps ahead still shows the previous opening (D-13)', async () => {
    const s = await base(5);
    const [c] = s.clients;
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 5)]);
    await ctx.setStatus(s.sheet, 'REOPENED');
    const l1 = await later(s.group, 1);
    const l2 = await later(s.group, 2);
    await seedLedger(ctx, l1.sheetId, c.id, tt(ctx), {
      opening: 5,
      closing: 5,
    });
    await seedLedger(ctx, l2.sheetId, c.id, tt(ctx), {
      opening: 5,
      closing: 5,
    });
    expect(
      (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], null)).status,
    ).toBe(200);
    expect(
      cell(rowOf(await view(l1.sheetId), 'milkTrayGrid', c.id), tt(ctx))
        .opening,
    ).toBe(3); // next sheet: live
    expect(
      cell(rowOf(await view(l2.sheetId), 'milkTrayGrid', c.id), tt(ctx))
        .opening,
    ).toBe(5); // two steps: lags
    await cascade(s.sheet.sheetId);
    expect(
      cell(rowOf(await view(l2.sheetId), 'milkTrayGrid', c.id), tt(ctx))
        .opening,
    ).toBe(3);
  });

  it('T-154 a new order line whose tray type is inactive still accrues taken; its Returned cell stays read-only', async () => {
    const s = await ctx.world.scene({ products: [{ tray: true }], clients: 1 });
    const [c] = s.clients;
    await setTrayActive(ctx, tt(ctx), false);
    await ctx.seedNight(s.sheet, [n(c, s.products[0], 5)]);
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
      tray_type_id: tt(ctx),
      trays_taken: 5,
      closing_balance: 5,
    });
    const body2 = await view(s.sheet.sheetId);
    expect(cell(rowOf(body2, 'milkTrayGrid', c.id), tt(ctx)).taken).toBe(5);
    expect(
      leaves(body2.milkTrayGrid.columns).find(
        (x) => x.field === `tray_${tt(ctx)}_returned`,
      )!.editable,
    ).toBe(false);
  });

  it('T-155 a line stored with no tray type starts producing trays once a matching rule exists (accepted, CT-14.4)', async () => {
    const s = await ctx.world.scene({ products: [{}], clients: 1 });
    const [c] = s.clients;
    const [p] = s.products;
    await ctx.seedNight(s.sheet, [n(c, p, 3)]);
    expect(await stored(s.sheet.sheetId)).toHaveLength(0);
    const prod = await ctx.db.master_product.findUniqueOrThrow({
      where: { id: p.id },
    });
    const rule = await ctx.db.product_tray_rule.create({
      data: {
        brand_id: prod.brand_id,
        product_group_id: prod.product_group_id,
        product_type_id: prod.product_type_id,
        applies_to_packaging: false,
        tray_type_id: tt(ctx),
        is_active: true,
      },
    });
    try {
      await ctx.seedNight(s.sheet, [n(c, p, 3)]); // any recalculation
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        tray_type_id: tt(ctx),
        trays_taken: 3,
      });
    } finally {
      await ctx.db.product_tray_rule.delete({ where: { id: rule.id } });
    }
  });

  it('T-156 order_sheet.group_id is indexed (CT-10.9); opening-balance results are covered by T-22 / T-70', async () => {
    const idx = await ctx.db.$queryRaw<
      { indexdef: string }[]
    >`SELECT indexdef FROM pg_indexes WHERE tablename = 'order_sheet'`;
    expect(idx.some((i) => i.indexdef.includes('(group_id)'))).toBe(true);
  });
});
