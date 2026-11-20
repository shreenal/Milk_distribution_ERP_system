/**
 * Collections – concurrency, retry, failure, and the Cash Settlement token (CD-7.2).
 * Scenarios: S-90 .. S-99, S-132 .. S-135   (S-100 and S-136 blocked, see coverage map)
 * (spec: CD-6.3, CD-7.2, CD-9.x)
 *
 * S-96 / S-97 / S-98 inject a fault through a spy on CollectionsRepository: the real condition (three
 * serialization failures, a 10 s transaction, a DB outage) cannot be produced deterministically over HTTP.
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
import { CollectionsRepository } from './collections.repository.js';
import {
  EXHAUSTED_MESSAGE,
  STALE_MESSAGE,
  TIMEOUT_MESSAGE,
  createCollectionsTestContext,
  entry,
  num,
  type CollectionsCtx,
} from '../../../../test/helper/collections-harness.js';

describe('Collections concurrency and failure handling', () => {
  let ctx: CollectionsCtx;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.world.deletePapers();
  });

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const is2xx = (s: number) => s >= 200 && s < 300;
  const CONFLICTS = [STALE_MESSAGE, EXHAUSTED_MESSAGE];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('S-90 two users save with the same token concurrently → exactly one succeeds, the other 409; one write', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const t = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 1),
    ]);
    const [r1, r2] = await Promise.all([
      ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', c, 2)],
        t,
        ctx.tokens.emp,
      ),
      ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', c, 3)],
        t,
        ctx.tokens.emp2,
      ),
    ]);
    const winners = [r1, r2].filter((r) => is2xx(r.status));
    const losers = [r1, r2].filter((r) => r.status === 409);
    expect(
      winners,
      `${r1.status}/${r2.status} ${body(r1)} ${body(r2)}`,
    ).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(CONFLICTS).toContain(losers[0].body.message);
    expect(
      num((await ctx.col.row(sheet.sheetId, c.id))!.office_cash_collection),
    ).toBe(winners[0] === r1 ? 2 : 3);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(
      winners[0].body.collectionsUpdatedAt,
    );
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(1);
  });

  it('S-91 milk save, then a non-milk save with the token loaded before it → 409 (one token for both categories)', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    const t0 = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c1, 1),
    ]);
    const milk = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c1, 2)],
      t0,
    );
    expect(milk.status, body(milk)).toBe(200);
    const nonMilk = await ctx.col.save(
      'night',
      'NON_MILK',
      sheet.sheetId,
      [entry('night', c2, 5)],
      t0,
    );
    expect(nonMilk.status).toBe(409);
    expect(nonMilk.body.message).toBe(STALE_MESSAGE);
    expect(await ctx.col.row(sheet.sheetId, c2.id, 'NON_MILK')).toBeNull();
  });

  it('S-92 user A saves night amounts; user B holding an open morning screen gets 409 on the next save', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const t0 = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 1),
    ]);
    const a = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 9)],
      t0,
      ctx.tokens.emp,
    );
    expect(a.status, body(a)).toBe(200);
    const b = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 10, 5)],
      t0,
      ctx.tokens.emp2,
    );
    expect(b.status).toBe(409);
    expect(b.body.message).toBe(STALE_MESSAGE);
  });

  it('S-93 a no-op save by A (equal values or empty entries) leaves B’s token valid', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const t0 = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 1),
    ]);
    for (const entries of [[entry('night', c, 1)], []]) {
      const a = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        entries,
        t0,
        ctx.tokens.emp,
      );
      expect(a.status).toBe(200);
      expect(a.body.changed).toBe(false);
    }
    const b = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 10, 5)],
      t0,
      ctx.tokens.emp2,
    );
    expect(b.status, body(b)).toBe(200);
  });

  it('S-94 double-click Save (same payload, same token) → first succeeds, second 409; one write', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const first = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 4)],
      null,
    );
    expect(first.status, body(first)).toBe(200);
    const second = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 4)],
      null,
    );
    expect(second.status).toBe(409);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(
      first.body.collectionsUpdatedAt,
    );
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(1);
  });

  it('S-95 retry with the old token after a lost response → 409 although the data was saved (accepted, CD-9.6)', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const saved = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 2)],
      null,
    ); // response "lost"
    expect(saved.status, body(saved)).toBe(200);
    const retry = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 2)],
      null,
    );
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe(STALE_MESSAGE);
    expect(
      num((await ctx.col.row(sheet.sheetId, c.id))!.office_cash_collection),
    ).toBe(2);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(1);
  });

  it('S-96 [fault seam] serialization conflict on all 3 attempts → 409 "conflicted with another update…"; nothing saved', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    vi.spyOn(
      CollectionsRepository.prototype,
      'getCollectionsForClients',
    ).mockRejectedValue(
      Object.assign(new Error('could not serialize access'), { code: 'P2034' }),
    );
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 2)],
      null,
    );
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(EXHAUSTED_MESSAGE);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  it('S-97 [fault seam] transaction timeout → 409 "took too long and nothing was saved"; nothing saved', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    vi.spyOn(
      CollectionsRepository.prototype,
      'getCollectionsForClients',
    ).mockRejectedValueOnce(
      Object.assign(new Error('Transaction already closed'), { code: 'P2028' }),
    );
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 2)],
      null,
    );
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(TIMEOUT_MESSAGE);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  it('S-98 [fault seam] unexpected exception after the tokens were touched → masked 500 with requestId; everything rolled back', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const paperBefore = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    vi.spyOn(
      CollectionsRepository.prototype,
      'upsertCollections',
    ).mockRejectedValueOnce(new Error('boom: secret connection string'));
    // a positive cash amount makes the save touch BOTH the sheet token and the paper token before the write
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 100, 0)],
      null,
    );
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).not.toBe('unknown');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect((await ctx.col.paperUpdatedAt(sheet)).getTime()).toBe(paperBefore);
  });

  it('S-99 two first-ever saves for the same (sheet, client, category) → never two rows, never a 500; one wins, the other 409', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const [r1, r2] = await Promise.all([
      ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', c, 2)],
        null,
        ctx.tokens.emp,
      ),
      ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', c, 3)],
        null,
        ctx.tokens.emp2,
      ),
    ]);
    expect([r1.status, r2.status].sort(), `${body(r1)} ${body(r2)}`).toEqual([
      200, 409,
    ]);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------------------------
  // CD-7.2: a changed cash amount advances order_paper.updated_at (Cash Settlement's token)
  // ---------------------------------------------------------------------------------------------
  async function openSheet(clients = 1) {
    const s = await ctx.world.scene({ clients });
    await ctx.setStatus(s.sheet, 'REOPENED');
    await sleep(15); // keep the clock strictly after setStatus' own write
    return s;
  }

  it('S-132 night / admin saves that change office cash, online or bank deposit leave order_paper.updated_at unchanged', async () => {
    const {
      sheet,
      clients: [c],
    } = await openSheet();
    const before = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    expect(
      (
        await ctx.col.save(
          'night',
          'MILK',
          sheet.sheetId,
          [entry('night', c, 100)],
          null,
        )
      ).status,
    ).toBe(200);
    const t = await ctx.col.tokenOf(sheet.sheetId);
    expect(
      (
        await ctx.col.save(
          'admin',
          'MILK',
          sheet.sheetId,
          [entry('admin', c, 50, 25)],
          t,
        )
      ).status,
    ).toBe(200);
    expect((await ctx.col.paperUpdatedAt(sheet)).getTime()).toBe(before);
  });

  it('S-133 a morning save that changes only cheque_collection leaves order_paper.updated_at unchanged', async () => {
    const {
      sheet,
      clients: [c],
    } = await openSheet();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      cash_collection: 100,
      cheque_collection: 10,
    });
    const before = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 100, 20)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.changed).toBe(true);
    expect((await ctx.col.paperUpdatedAt(sheet)).getTime()).toBe(before);
  });

  it('S-134 a morning save that creates a positive cash row, or changes stored cash, advances order_paper.updated_at strictly forward', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await openSheet(2);
    const t0 = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    const created = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c1, 100, 0)],
      null,
    );
    expect(created.status, body(created)).toBe(200);
    const t1 = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    expect(t1).toBeGreaterThan(t0);

    const changed = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c1, 150, 0)],
      created.body.collectionsUpdatedAt,
    );
    expect(changed.status, body(changed)).toBe(200);
    const t2 = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    expect(t2).toBeGreaterThan(t1);

    // an equal-value follow-up does not advance it again
    const same = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c1, 150, 0)],
      changed.body.collectionsUpdatedAt,
    );
    expect(same.body.changed).toBe(false);
    expect((await ctx.col.paperUpdatedAt(sheet)).getTime()).toBe(t2);
    void c2;
  });

  it('S-135 a failing (400 / 409) or no-op morning save leaves order_paper.updated_at unchanged', async () => {
    const {
      sheet,
      clients: [c],
    } = await openSheet();
    const t = await ctx.col.seed('morning', 'MILK', sheet.sheetId, [
      entry('morning', c, 100, 0),
    ]);
    const before = (await ctx.col.paperUpdatedAt(sheet)).getTime();
    const bad = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 200, 0), entry('morning', 2000000000, 5, 0)],
      t,
    );
    expect(bad.status).toBe(400);
    const stale = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 300, 0)],
      '2020-01-01T00:00:00.000Z',
    );
    expect(stale.status).toBe(409);
    const noop = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 100, 0)],
      t,
    );
    expect(noop.body.changed).toBe(false);
    expect((await ctx.col.paperUpdatedAt(sheet)).getTime()).toBe(before);
    expect(num((await ctx.col.row(sheet.sheetId, c.id))!.cash_collection)).toBe(
      100,
    );
  });
});
