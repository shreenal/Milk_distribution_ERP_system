/**
 * Dairy Trays: concurrency, retry and failure handling. Scenarios DY-51, DY-52, DY-120 to DY-125
 * (behavioral spec sections C3, C10). DY-120, DY-121 and DY-123 are FAULT SEAMS (repository spy).
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
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import { DairyTraysRepository } from './dairy-trays.repository.js';
import {
  DT_RETRY_MSG,
  DT_TIMEOUT_MSG,
  STALE_DT,
  cleanupDtTests,
  dairyRows,
  dtApi,
  dtRow,
  dtToken,
  ledgerScene,
  re,
} from '../../../../test/helper/dairy-trays-helpers.js';
import {
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

describe('DY-51 and DY-52 concurrent saves', () => {
  it('DY-51: two users save with the same token concurrently: exactly one succeeds, the other is 409; one write', async () => {
    const s = await ledgerScene(ctx);
    const token = (await s.token())!;
    const [a, b] = await Promise.all([
      dt.save(s.paperId, [re(s.v, s.trayTypeId, 3)], token),
      dt.save(s.paperId, [re(s.v, s.trayTypeId, 4)], token, {
        token: ctx.tokens.emp2,
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses, `${text(a)} | ${text(b)}`).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const winner = a.status === 200 ? a : b;
    expect(text(loser)).toMatch(
      new RegExp(`${STALE_DT.slice(0, 20)}|${DT_RETRY_MSG.slice(0, 20)}`),
    );
    expect(
      (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!.trays_returned,
    ).toBe(winner === a ? 3 : 4);
    expect(await s.token()).toBe(winner.body.dairyTraysUpdatedAt);
  });

  it('DY-52: a double click on Save (same payload, same token) gives one success and one 409', async () => {
    const s = await ledgerScene(ctx);
    const token = (await s.token())!;
    const send = () => dt.save(s.paperId, [re(s.v, s.trayTypeId, 5)], token);
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort(), `${text(a)} | ${text(b)}`).toEqual([
      200, 409,
    ]);
    expect(
      (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!.trays_returned,
    ).toBe(5);
  });
});

describe('DY-120 to DY-123 retry, timeout, failure (fault seams)', () => {
  it('DY-120 (seam): serialization conflicts exhaust 3 attempts: 409 "conflicted with another update"; nothing saved', async () => {
    const s = await ledgerScene(ctx);
    const before = JSON.stringify(await dairyRows(ctx, s.paperId));
    const token = await s.token();
    const spy = vi
      .spyOn(DairyTraysRepository.prototype, 'replaceTrayTransactions')
      .mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('serialization failure', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      );
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2)], token);
    expect(r.status, text(r)).toBe(409);
    expect(text(r)).toContain(DT_RETRY_MSG);
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
    expect(await s.token()).toBe(token);
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(before);
  });

  it('DY-121 (seam): a transaction that exceeds its 10 s limit saves nothing and is 409 "took too long"', async () => {
    const s = await ledgerScene(ctx);
    const before = JSON.stringify(await dairyRows(ctx, s.paperId));
    const token = await s.token();
    vi.spyOn(
      DairyTraysRepository.prototype,
      'replaceTrayTransactions',
    ).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(undefined as never), 12_000),
        ),
    );
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2)], token);
    expect(r.status, text(r)).toBe(409);
    expect(text(r)).toContain(DT_TIMEOUT_MSG);
    vi.restoreAllMocks();
    expect(await s.token()).toBe(token);
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(before);
  }, 30_000);

  it('DY-122: after a lost response the retry with the old token is 409; the same payload with the new token is a no-op that leaves the token unchanged', async () => {
    const s = await ledgerScene(ctx);
    const old = (await s.token())!;
    const first = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 4)], old);
    expect(first.status, text(first)).toBe(200);
    const fresh = first.body.dairyTraysUpdatedAt as string;

    const retryOld = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 4)], old);
    expect(retryOld.status).toBe(409);

    const retryNew = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 4)],
      fresh,
    );
    expect(retryNew.status, text(retryNew)).toBe(200);
    expect(retryNew.body.changed).toBe(false);
    expect(retryNew.body.dairyTraysUpdatedAt).toBe(fresh);
    expect(await s.token()).toBe(fresh);
  });

  it('DY-123 (seam): an unexpected exception after the writes is a masked 500 with a request id; rows and token are rolled back', async () => {
    const s = await ledgerScene(ctx);
    const before = JSON.stringify(await dairyRows(ctx, s.paperId));
    const token = await s.token();
    vi.spyOn(
      DairyTraysRepository.prototype,
      'replaceTrayTransactions',
    ).mockRejectedValue(new Error('secret internal detail'));
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2)], token);
    vi.restoreAllMocks();
    expect(r.status, text(r)).toBe(500);
    expect(text(r)).not.toContain('secret internal detail');
    expect(text(r)).toContain('requestId');
    expect(await s.token()).toBe(token);
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(before);
  });
});

describe('DY-124 and DY-125 races with other writers', () => {
  it('DY-124 (adapted): a save racing a status change is 200 or 400, never 5xx; ledger and token agree with the outcome', async () => {
    const s = await ledgerScene(ctx);
    const token = (await s.token())!;
    const [save] = await Promise.all([
      dt.save(s.paperId, [re(s.v, s.trayTypeId, 3)], token),
      ctx.db.order_paper.update({
        where: { id: s.paperId },
        data: { status: 'MORNING_SUBMITTED' },
      }),
    ]);
    expect([200, 400], text(save)).toContain(save.status);
    const returned = (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!
      .trays_returned;
    if (save.status === 200) {
      expect(returned).toBe(3);
      expect(await s.token()).toBe(save.body.dairyTraysUpdatedAt);
    } else {
      expect(returned).toBe(0);
      expect(await s.token()).toBe(token);
    }
  });

  it('DY-125: a Dairy save racing a Purchase save: never 5xx; every stored line stays consistent with the purchases and the balance rule', async () => {
    const s = await purchaseScene(ctx, { qty: 10, products: [{ tray: true }] });
    const trayTypeId = ctx.world.brandTray.trayTypeId!;
    await ctx.db.purchase_paper.upsert({
      where: { order_paper_id: s.paperId },
      update: {},
      create: { order_paper_id: s.paperId },
    });
    expect(
      (
        await puApi(ctx).save(
          s.paperId,
          [await pe(ctx, s.paperId, s.v1, s.dist, s.p, 10)],
          await puToken(ctx, s.paperId),
        )
      ).status,
    ).toBe(200);
    const dairyTokenNow = (await dtToken(ctx, s.paperId))!;
    const purchaseEntry = await pe(ctx, s.paperId, s.v1, s.dist, s.p, 8);
    const purchaseToken = await puToken(ctx, s.paperId);

    const [d, p] = await Promise.all([
      dt.save(s.paperId, [re(s.v1, trayTypeId, 3)], dairyTokenNow),
      puApi(ctx).save(s.paperId, [purchaseEntry], purchaseToken),
    ]);
    for (const r of [d, p]) expect([200, 409], text(r)).toContain(r.status);
    expect([d.status, p.status]).toContain(200);

    const row = await dtRow(ctx, s.paperId, s.v1, trayTypeId);
    const purchased = Number(
      (
        await ctx.db.purchase_entry.findFirstOrThrow({
          where: { vehicle_id: s.v1.id },
        })
      ).purchased_qty,
    );
    expect(row!.trays_taken).toBe(purchased);
    expect(row!.trays_returned ?? 0).toBeLessThanOrEqual(
      row!.opening_balance + row!.trays_taken,
    );
    expect(row!.closing_balance).toBe(
      row!.opening_balance + row!.trays_taken - (row!.trays_returned ?? 0),
    );
  });
});

it.todo(
  'DY-127: opening-balance read and forward dry run on a long history finish inside 10 s (operational, DT-10.10; not assertable deterministically)',
);
