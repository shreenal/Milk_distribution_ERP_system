/**
 * Client Trays – concurrency, retry, failure handling.
 * Scenarios: T-100 .. T-107, T-109   (T-108 lives in client-trays.scenario.paper.spec.ts)
 * (spec: CT-5.2, CT-5.14, CT-9.x)
 *
 * T-104 / T-105 / T-106 inject a fault through a repository spy (same technique as the Orders suite):
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
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  RETRY_MSG,
  STALE,
  TIMEOUT_MSG,
  cleanupTrayTests,
  outboxOf,
  addDays,
  ret,
  seedLedger,
  submittedWithTrays,
  traysApi,
  trayToken,
  tt,
  utc,
} from '../../../../test/helper/client-trays-helpers.js';
import { ClientTraysRepository } from './client-trays.repository.js';
import { ClientTraysPropagationService } from './services/client-trays-propagation.service.js';
import { isSerializationFailure } from '../../../common/transactions/db-errors.js';

describe('Client Trays concurrency and failure handling', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = traysApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const is2xx = (s: number) => s >= 200 && s < 300;
  const returned = async (sheetId: number) =>
    (await ctx.trayRows(sheetId))[0].trays_returned;

  it('T-100 two users save with the same token concurrently → exactly one succeeds, the other 409; one write', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const [c] = s.clients;
    const t = (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null))
      .body.clientTraysUpdatedAt;
    const [r1, r2] = await Promise.all([
      api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], t, ctx.tokens.emp),
      api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 3)], t, ctx.tokens.emp2),
    ]);
    const winners = [r1, r2].filter((r) => is2xx(r.status));
    const losers = [r1, r2].filter((r) => r.status === 409);
    expect(
      winners,
      `${r1.status}/${r2.status} ${body(r1)} ${body(r2)}`,
    ).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect([STALE, RETRY_MSG]).toContain(losers[0].body.message);
    expect(await returned(s.sheet.sheetId)).toBe(winners[0] === r1 ? 2 : 3);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
      winners[0].body.clientTraysUpdatedAt,
    );
    expect(await ctx.trayRows(s.sheet.sheetId)).toHaveLength(1);
  });

  it('T-101 double click: same payload and token twice → first succeeds, second 409; one write', async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    const first = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 2)],
      null,
    );
    expect(is2xx(first.status), body(first)).toBe(true);
    const second = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 2)],
      null,
    );
    expect(second.status).toBe(409);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
      first.body.clientTraysUpdatedAt,
    );
  });

  it('T-102 re-save of identical values with the fresh token is a no-op: no write, token kept, no cascade on REOPENED (CT-5.14)', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const [c] = s.clients;
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 5)]);
    await ctx.setStatus(s.sheet, 'REOPENED');
    const first = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 2)],
      null,
    );
    expect(first.status, body(first)).toBe(200);
    expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(1);
    const again = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 2)],
      first.body.clientTraysUpdatedAt,
    );
    expect(again.status, body(again)).toBe(200);
    expect(again.body.clientTraysUpdatedAt).toBe(
      first.body.clientTraysUpdatedAt,
    );
    expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(1);
  });

  it('T-103 retry with the old token after a lost response → 409 although the data was saved (accepted, CT-9.6)', async () => {
    const s = await submittedWithTrays(ctx);
    const [c] = s.clients;
    expect(
      (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], null)).status,
    ).toBe(200); // response "lost"
    const retry = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 2)],
      null,
    );
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe(STALE);
    expect(await returned(s.sheet.sheetId)).toBe(2);
  });

  it('T-104 [fault seam] serialization conflicts exhaust 3 attempts → 409 "conflicted with another update"; token rolled back', async () => {
    const s = await submittedWithTrays(ctx);
    const spy = vi
      .spyOn(ClientTraysRepository.prototype, 'replaceTrayTransactions')
      .mockRejectedValue(
        Object.assign(new Error('Write conflict'), { code: 'P2034' }),
      );
    const res = await api.save(
      s.sheet.sheetId,
      [ret(s.clients[0].id, tt(ctx), 2)],
      null,
    );
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(RETRY_MSG);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
    expect(await returned(s.sheet.sheetId)).toBe(0);
  });

  it('T-105 [fault seam] transaction timeout → 409 "took too long and nothing was saved"; nothing saved', async () => {
    const s = await submittedWithTrays(ctx);
    vi.spyOn(
      ClientTraysRepository.prototype,
      'replaceTrayTransactions',
    ).mockRejectedValueOnce(
      Object.assign(new Error('Transaction already closed'), { code: 'P2028' }),
    );
    const res = await api.save(
      s.sheet.sheetId,
      [ret(s.clients[0].id, tt(ctx), 2)],
      null,
    );
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(TIMEOUT_MSG);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
    expect(await returned(s.sheet.sheetId)).toBe(0);
  });

  it('T-106 [fault seam] unexpected exception after the token was touched → masked 500 with requestId; token and ledger rolled back', async () => {
    const s = await submittedWithTrays(ctx);
    vi.spyOn(
      ClientTraysRepository.prototype,
      'replaceTrayTransactions',
    ).mockRejectedValueOnce(new Error('boom: secret connection string'));
    const res = await api.save(
      s.sheet.sheetId,
      [ret(s.clients[0].id, tt(ctx), 2)],
      null,
    );
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).not.toBe('unknown');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
    expect(await returned(s.sheet.sheetId)).toBe(0);
  });

  it('T-107 Orders lowers taken after the user loaded; the old token still matches, the server revalidates on live numbers → 400 over-return', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const [c] = s.clients;
    const loaded = (await api.get(s.sheet.sheetId)).body.sheet
      .client_trays_updated_at; // user A loads
    expect(loaded).toBeNull();
    const o = await ctx.api.morning(
      s.sheet.sheetId,
      [m(c, s.products[0], 3)],
      await ctx.tokenOf(s.sheet.sheetId),
    ); // user B
    expect(o.status, body(o)).toBe(200);
    expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull(); // Orders does not advance the tray token (CT-9.1)
    const res = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 5)],
      loaded,
    );
    expect(res.status, body(res)).toBe(400);
    expect(body(res)).toContain('exceeds the outstanding balance of 3');
    expect(await returned(s.sheet.sheetId)).toBe(0);
  });

  it('T-109 REOPENED return save while a cascade rewrites the same later sheet: save is 200 or 409 (never 5xx), the job is retryable, the ledger converges', async () => {
    // The matrix states the outcome as "serializable conflict, retried; or 409". The job body is run directly
    // (queue stubbed) in a Serializable transaction, concurrently with the save.
    const D = utc(2098, 2, 10);
    const s = await submittedWithTrays(ctx, { qty: 5, saleDate: D });
    const [c] = s.clients;
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 5)]);
    await ctx.setStatus(s.sheet, 'REOPENED');
    const later = await ctx.world.newSheet({
      group: s.group,
      saleDate: addDays(D, 1),
    });
    await seedLedger(ctx, later.sheetId, c.id, tt(ctx), {
      opening: 5,
      closing: 5,
    });
    const propagation = ctx.app.get(ClientTraysPropagationService, {
      strict: false,
    });
    const runJob = () =>
      ctx.prisma
        .$transaction(
          (tx) =>
            propagation.cascadeForwardChunk(
              s.sheet.sheetId,
              null,
              20,
              tx as never,
            ),
          {
            isolationLevel: 'Serializable' as never,
          },
        )
        .then(
          () => 'ok' as const,
          (e: unknown) => e,
        );

    const [save, job] = await Promise.all([
      api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], null),
      runJob(),
    ]);
    expect([200, 409], body(save)).toContain(save.status);
    if (job !== 'ok')
      expect(isSerializationFailure(job), String(job)).toBe(true); // BullMQ retries these
    expect(await runJob()).toBe('ok'); // a rerun after both finished must converge
    const closing = (await ctx.trayRows(s.sheet.sheetId))[0].closing_balance;
    expect(closing).toBe(save.status === 200 ? 3 : 5);
    expect(
      (
        await ctx.db.client_tray_transaction.findMany({
          where: { order_sheet_id: later.sheetId },
        })
      )[0].opening_balance,
    ).toBe(closing);
  }, 30000);
});
