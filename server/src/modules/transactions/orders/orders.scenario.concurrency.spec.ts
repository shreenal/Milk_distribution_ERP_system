/**
 * Orders – concurrency, retry, failure handling.
 * Scenarios: S-120, S-121, S-122, S-123, S-125, S-126, S-127   (S-124 blocked, see coverage map)
 * (spec: OD-6.2, OD-6.12, OD-12.x)
 *
 * S-125 / S-126 / S-127 inject a fault through a test seam (a spy on a repository or billing method)
 * because the real condition (10 s transaction, DB outage, a second writer between two statements)
 * cannot be produced deterministically through HTTP.
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
import { OrdersRepository } from './orders.repository.js';
import { BillingService } from './services/billing.service.js';
import {
  createOrdersTestContext,
  n,
  num,
  sleep,
  STALE_MESSAGE,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';

describe('Orders concurrency and failure handling', () => {
  let ctx: OrdersCtx;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.world.deletePapers();
  });

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const is2xx = (s: number) => s >= 200 && s < 300;
  const CONFLICT_MESSAGES = [
    STALE_MESSAGE,
    'Your request conflicted with another update and could not be completed. Please retry.',
    'Another save changed this sheet at the same time. Please reload and retry.',
  ];

  it('S-120 two users save with the same token concurrently → exactly one succeeds, the other gets 409; one write', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const t = await ctx.seedNight(sheet, [n(c, p, 1)]);
    const [r1, r2] = await Promise.all([
      ctx.api.night(sheet.sheetId, [n(c, p, 2)], t, ctx.tokens.emp),
      ctx.api.night(sheet.sheetId, [n(c, p, 3)], t, ctx.tokens.emp2),
    ]);
    const winners = [r1, r2].filter((r) => is2xx(r.status));
    const losers = [r1, r2].filter((r) => r.status === 409);
    expect(
      winners,
      `${r1.status}/${r2.status} ${body(r1)} ${body(r2)}`,
    ).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(CONFLICT_MESSAGES).toContain(losers[0].body.message);

    const winnerQty = winners[0] === r1 ? 2 : 3;
    expect(num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty)).toBe(
      winnerQty,
    );
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(
      winners[0].body.itemsUpdatedAt,
    );
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(1);
  });

  it('S-121 same payload and same token sent twice (double click) → first succeeds, second 409; one write', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const payload = [n(c, p, 4)];
    const first = await ctx.api.night(sheet.sheetId, payload, null);
    expect(is2xx(first.status), body(first)).toBe(true);
    const second = await ctx.api.night(sheet.sheetId, payload, null);
    expect(second.status).toBe(409);
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(first.body.itemsUpdatedAt);
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(1);
  });

  it('S-122 re-saving identical values with the fresh token is a change: token advances, line updated_at advances', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const t1 = await ctx.seedNight(sheet, [n(c, p, 2)]);
    const before = (await ctx.line(sheet.sheetId, c.id, p.id))!.updated_at;
    await sleep(25);
    const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], t1);
    expect(is2xx(res.status), body(res)).toBe(true);
    expect(new Date(res.body.itemsUpdatedAt).getTime()).toBeGreaterThan(
      new Date(t1!).getTime(),
    );
    expect(
      (await ctx.line(sheet.sheetId, c.id, p.id))!.updated_at.getTime(),
    ).toBeGreaterThan(before.getTime());
  });

  it('S-123 client retries with the old token after a lost response → 409 although the data was saved (accepted, OD-12.9)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const saved = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null); // response "lost"
    expect(is2xx(saved.status), body(saved)).toBe(true);
    const retry = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe(STALE_MESSAGE);
    expect(num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty)).toBe(
      2,
    );
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(1);
  });

  it('S-125 [fault seam] transaction timeout → 409 "took too long and nothing was saved"; nothing saved', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    vi.spyOn(
      OrdersRepository.prototype,
      'findSheetItemsByProductBatch',
    ).mockRejectedValueOnce(
      Object.assign(new Error('Transaction already closed'), { code: 'P2028' }),
    );
    const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null);
    expect(res.status, body(res)).toBe(409);
    expect(String(res.body.message)).toMatch(
      /took too long and nothing was saved/,
    );
    expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
  });

  it('S-126 [fault seam] unexpected exception after the token was touched → masked 500 with requestId; everything rolled back', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene({ products: [{ tray: true }] });
    vi.spyOn(
      BillingService.prototype,
      'saveNightEntriesBatch',
    ).mockRejectedValueOnce(new Error('boom: secret connection string'));
    const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).not.toBe('unknown');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
    expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.trayRows(sheet.sheetId)).toHaveLength(0);
  });

  it('S-127 [race seam] unique-key race on a line insert (night) → 409 "Another save changed this sheet…", rollback', async () => {
    // A concurrent writer already holds the (sheet, client, product) line on another product link.
    // This request does not see it, resolves a different supplier link and collides on the
    // (sheet, client, product) unique key.
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await world.scene({
      products: [
        {
          distributors: [
            { dist: world.distA, rate: 56 },
            { dist: world.distB, rate: 50 },
          ],
        },
      ],
    });
    const t = await ctx.seedNight(sheet, [n(c, p, 1)]); // line created on distA's link
    await ctx.db.master_client_category.updateMany({
      where: { client_id: c.id, category: 'MILK' },
      data: { supplier_distributor_id: world.distB.id },
    });
    vi.spyOn(
      OrdersRepository.prototype,
      'findSheetItemsByProductBatch',
    ).mockResolvedValueOnce(new Map() as never);
    const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], t);
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(
      'Another save changed this sheet at the same time. Please reload and retry.',
    );
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.ordered_qty)).toBe(1);
    expect(l.product_link_id).toBe(p.links[world.distA.id]);
  });
});
