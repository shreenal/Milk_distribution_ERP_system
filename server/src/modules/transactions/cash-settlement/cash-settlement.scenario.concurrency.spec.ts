/**
 * Cash Settlement – save response, token, concurrency, retry, failure.
 * Scenarios: S-100 .. S-104, S-110 .. S-121   (spec: CS-10, CS-11, CD-7.2, PA-8.11, PA-17.6)
 *
 * Fault seams (flagged in the coverage map): S-113 / S-114 / S-115 inject a P2034, a P2028 and an unexpected Error
 * through a spy on CashSettlementRepository. The real 10 s timeout is not exercised.
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
  MSG,
  SECTIONS,
  VIEW_KEYS,
  ok,
  expense,
  denomination,
  directEntry,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – response, token, concurrency', () => {
  let ctx: CashCtx;
  beforeAll(async () => {
    ctx = await createCashTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.cs.cleanup();
  });

  const cs = () => ctx.cs;
  const tok = (paperId: number) => cs().paperToken(paperId);

  it.each(SECTIONS)(
    'S-100 / S-104 %s: HTTP 200 and the documented body; no paper, no workflow',
    async (section) => {
      const s = await cs().scene({ routes: [{ cash: 100 }] });
      const res = await cs().save(
        section,
        s.paperId,
        [cs().changing(section, s)],
        await tok(s.paperId),
      );
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(
        ['success', 'changed', 'cashSettlementUpdatedAt', ...VIEW_KEYS].sort(),
      );
      expect(res.body).not.toHaveProperty('paper');
      expect(res.body).not.toHaveProperty('workflow');
      expect(res.body.success).toBe(true);
    },
  );

  it('S-101 the figures in the response reflect the write (rebuilt from stored data)', async () => {
    const s = await cs().scene({ routes: [{ cash: 1000 }] });
    const [r] = s.routes;
    const den = ok(
      await cs().save(
        'denominations',
        s.paperId,
        [denomination(r.sheetId, { note500: 2 })],
        await tok(s.paperId),
      ),
    );
    expect(
      den.routeSettlements.find((x: any) => x.sheetId === r.sheetId),
    ).toMatchObject({ denominationTotal: 1000, difference: 0 });
    expect(den.submission.ready).toBe(true);
    const dir = ok(
      await cs().save(
        'direct',
        s.paperId,
        [directEntry(s.employee.id, { note100: 3 })],
        await tok(s.paperId),
      ),
    );
    expect(dir.summary.directCollectionCash).toBe(300);
    expect(dir.summary.officeCash).toBe(1300);
  });

  it('S-102 a no-op returns changed false and the current token, and does not touch updated_at', async () => {
    const s = await cs().scene();
    const before = await tok(s.paperId);
    const body = ok(await cs().save('expenses', s.paperId, [], before));
    expect(body.changed).toBe(false);
    expect(body.cashSettlementUpdatedAt).toBe(before);
    expect(await tok(s.paperId)).toBe(before);
  });

  it('S-103 the token moves strictly forward even when the stored value is ahead of the clock', async () => {
    const s = await cs().scene();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await ctx.db.order_paper.update({
      where: { id: s.paperId },
      data: { updated_at: future },
    });
    const before = await tok(s.paperId);
    expect(before).toBe(future.toISOString());
    const body = ok(
      await cs().save(
        'expenses',
        s.paperId,
        [cs().changing('expenses', s)],
        before,
      ),
    );
    expect(new Date(body.cashSettlementUpdatedAt).getTime()).toBeGreaterThan(
      future.getTime(),
    );
  });

  it('S-110 two users save with the same token: one 200, one 409, one write', async () => {
    const s = await cs().scene();
    const token = await tok(s.paperId);
    const [a, b] = await Promise.all([
      cs().save(
        'expenses',
        s.paperId,
        [expense(s.routes[0].sheetId, s.type.id, 10)],
        token,
        { token: ctx.tokens.emp },
      ),
      cs().save(
        'expenses',
        s.paperId,
        [expense(s.routes[0].sheetId, s.type.id, 20)],
        token,
        { token: ctx.tokens.emp2 },
      ),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await cs().expenses(s.paperId)).toHaveLength(1);
  });

  it('S-111 a double click (same payload, same token): one success, one 409, one write', async () => {
    const s = await cs().scene();
    const token = await tok(s.paperId);
    const payload = [expense(s.routes[0].sheetId, s.type.id, 10)];
    const res = await Promise.all([
      cs().save('expenses', s.paperId, payload, token),
      cs().save('expenses', s.paperId, payload, token),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await cs().expenses(s.paperId)).toHaveLength(1);
  });

  it('S-112 the response was lost and the client retries with the old token: 409 although the data was saved (CS-10.8)', async () => {
    const s = await cs().scene();
    const token = await tok(s.paperId);
    const payload = [expense(s.routes[0].sheetId, s.type.id, 10)];
    ok(await cs().save('expenses', s.paperId, payload, token));
    const retry = await cs().save('expenses', s.paperId, payload, token);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe(MSG.STALE);
    expect(await cs().expenses(s.paperId)).toHaveLength(1);
  });

  it('S-113 a serialization conflict on all 3 attempts: 409 "conflicted with another update", nothing saved (SEAM)', async () => {
    const s = await cs().scene();
    const before = await tok(s.paperId);
    const spy = vi
      .spyOn(cs().repo(), 'getPaperHeader')
      .mockRejectedValue(
        Object.assign(new Error('serialization'), { code: 'P2034' }),
      );
    const res = await cs().save(
      'expenses',
      s.paperId,
      [cs().changing('expenses', s)],
      before,
    );
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(MSG.RETRY);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(await tok(s.paperId)).toBe(before);
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
  });

  it('S-114 a transaction that exceeds its time limit: 409 "took too long and nothing was saved" (SEAM)', async () => {
    const s = await cs().scene();
    const before = await tok(s.paperId);
    vi.spyOn(cs().repo(), 'getPaperHeader').mockRejectedValue(
      Object.assign(new Error('timeout'), { code: 'P2028' }),
    );
    const res = await cs().save(
      'expenses',
      s.paperId,
      [cs().changing('expenses', s)],
      before,
    );
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(MSG.TIMEOUT);
    expect(await tok(s.paperId)).toBe(before);
  });

  it('S-115 an unexpected exception after the token was advanced: masked 500 with requestId; token and data rolled back (SEAM)', async () => {
    const s = await cs().scene();
    const before = await tok(s.paperId);
    vi.spyOn(cs().repo(), 'applyExpenseChanges').mockRejectedValue(
      new Error('boom'),
    );
    const res = await cs().save(
      'expenses',
      s.paperId,
      [cs().changing('expenses', s)],
      before,
    );
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('boom');
    expect(await tok(s.paperId)).toBe(before);
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
    expect(await cs().settlements(s.paperId)).toHaveLength(0);
  });

  it('S-116 any save that fails (400 or 409) leaves the token unchanged', async () => {
    const s = await cs().scene();
    const other = await cs().scene();
    const before = await tok(s.paperId);
    const bad = await cs().save(
      'denominations',
      s.paperId,
      [denomination(other.routes[0].sheetId, { note10: 1 })],
      before,
    );
    expect(bad.status).toBe(400);
    const stale = await cs().save(
      'expenses',
      s.paperId,
      [cs().changing('expenses', s)],
      new Date(0).toISOString(),
    );
    expect(stale.status).toBe(409);
    expect(await tok(s.paperId)).toBe(before);
  });

  it("S-117 user A's no-op save does not invalidate user B's open screen", async () => {
    const s = await cs().scene();
    const bToken = await tok(s.paperId);
    ok(
      await cs().save('expenses', s.paperId, [], bToken, {
        token: ctx.tokens.emp,
      }),
    );
    const b = await cs().save(
      'denominations',
      s.paperId,
      [cs().changing('denominations', s)],
      bToken,
      { token: ctx.tokens.emp2 },
    );
    expect(b.status).toBe(200);
  });

  it("S-118 A saves one section; B has another section open: B's next save is 409 (one token)", async () => {
    const s = await cs().scene();
    const bToken = await tok(s.paperId);
    ok(
      await cs().save(
        'expenses',
        s.paperId,
        [cs().changing('expenses', s)],
        bToken,
      ),
    );
    const b = await cs().save(
      'deposits',
      s.paperId,
      [cs().changing('deposits', s)],
      bToken,
      { token: ctx.tokens.emp2 },
    );
    expect(b.status).toBe(409);
    expect(await cs().depositRows(s.paperId)).toHaveLength(0);
  });

  it('S-119 reopen and revert advance the token; marking a sheet no-operation does not', async () => {
    // revert (MORNING_SUBMITTED -> NIGHT_SUBMITTED)
    const a = await cs().scene({ status: 'MORNING_SUBMITTED' });
    const aBefore = await tok(a.paperId);
    expect(
      (
        await ctx.call(
          'post',
          `/papers/${a.paperId}/revert-morning`,
          ctx.tokens.admin,
          { reason: 'fix' },
        )
      ).status,
    ).toBeLessThan(300);
    expect(new Date(await tok(a.paperId)).getTime()).toBeGreaterThan(
      new Date(aBefore).getTime(),
    );
    // reopen (FINALIZED -> REOPENED)
    const b = await cs().scene({ status: 'FINALIZED' });
    const bBefore = await tok(b.paperId);
    expect(
      (
        await ctx.call(
          'post',
          `/papers/${b.paperId}/reopen`,
          ctx.tokens.admin,
          { reason: 'fix' },
        )
      ).status,
    ).toBeLessThan(300);
    expect(new Date(await tok(b.paperId)).getTime()).toBeGreaterThan(
      new Date(bBefore).getTime(),
    );
    // no-operation (DRAFT only)
    const c = await cs().scene({ status: 'DRAFT' });
    const cBefore = await tok(c.paperId);
    const mark = await ctx.call(
      'post',
      `/papers/${c.paperId}/sheets/no-operation`,
      ctx.tokens.emp,
      { sheetIds: [c.routes[0].sheetId], noOperation: true },
    );
    expect(mark.status, JSON.stringify(mark.body)).toBeLessThan(300);
    expect(await tok(c.paperId)).toBe(cBefore);
  });

  it('S-120 a Collections save that changes a cash amount advances the token (an old Cash Settlement screen gets 409); cheque-only does not (CD-7.2)', async () => {
    const s = await cs().scene({ routes: [{}] });
    const [r] = s.routes;
    const staleScreen = await tok(s.paperId);
    ok(await cs().collectionsMorning(r.sheetId, r.client.id, 0, 25)); // cheque only
    expect(await tok(s.paperId)).toBe(staleScreen);
    ok(await cs().collectionsMorning(r.sheetId, r.client.id, 100, 25)); // cash changes
    expect(new Date(await tok(s.paperId)).getTime()).toBeGreaterThan(
      new Date(staleScreen).getTime(),
    );
    const res = await cs().save(
      'expenses',
      s.paperId,
      [cs().changing('expenses', s)],
      staleScreen,
    );
    expect(res.status).toBe(409);
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
    // and the new route cash is what the screen reads
    expect(ok(await cs().get(s.paperId)).routeSettlements[0].routeCash).toBe(
      100,
    );
  });

  /**
   * Collections never carries a Cash Settlement token: inside its own transaction it advances whatever
   * order_paper.updated_at is CURRENT (CD-7.2). So in a race either order is valid:
   *  - Collections commits first  -> the Cash Settlement save (old token) is 409 and writes nothing;
   *  - Cash Settlement commits first -> both are 200 (Collections is not stale against a token it never sent).
   * What must hold in every order: Collections is 200, the Cash Settlement save is 200 or 409, a 409 wrote nothing,
   * the token moved forward and the route cash is the saved 100.
   */
  it('S-121 a Collections cash save and a Cash Settlement save race: Collections always 200; Cash Settlement 200 or 409; a loser writes nothing', async () => {
    const s = await cs().scene({ routes: [{}] });
    const [r] = s.routes;
    const token = await tok(s.paperId);
    const collectionsToken = await cs().collectionsToken(r.sheetId);
    const [col, cash] = await Promise.all([
      ctx.call(
        'post',
        `/collections/sheet/${r.sheetId}/milk/morning-save`,
        ctx.tokens.emp,
        {
          entries: [
            { clientId: r.client.id, cashCollection: 100, chequeCollection: 0 },
          ],
          expectedUpdatedAt: collectionsToken,
        },
      ),
      cs().save(
        'expenses',
        s.paperId,
        [expense(r.sheetId, s.type.id, 10)],
        token,
        { token: ctx.tokens.emp2 },
      ),
    ]);
    expect(col.status, JSON.stringify(col.body)).toBe(200);
    expect([200, 409], JSON.stringify(cash.body)).toContain(cash.status);
    expect(await cs().expenses(s.paperId)).toHaveLength(
      cash.status === 200 ? 1 : 0,
    );
    expect(new Date(await tok(s.paperId)).getTime()).toBeGreaterThan(
      new Date(token).getTime(),
    );
    expect(ok(await cs().get(s.paperId)).routeSettlements[0].routeCash).toBe(
      100,
    );
  });

  it('S-121b deterministic order: a Cash Settlement save first, then a Collections cash save: both 200 and the token moves twice (CD-7.2)', async () => {
    const s = await cs().scene({ routes: [{}] });
    const [r] = s.routes;
    const t0 = await tok(s.paperId);
    ok(
      await cs().save(
        'expenses',
        s.paperId,
        [expense(r.sheetId, s.type.id, 10)],
        t0,
      ),
    );
    const t1 = await tok(s.paperId);
    expect(new Date(t1).getTime()).toBeGreaterThan(new Date(t0).getTime());
    ok(await cs().collectionsMorning(r.sheetId, r.client.id, 100, 0));
    expect(new Date(await tok(s.paperId)).getTime()).toBeGreaterThan(
      new Date(t1).getTime(),
    );
    expect(await cs().expenses(s.paperId)).toHaveLength(1);
  });
});
