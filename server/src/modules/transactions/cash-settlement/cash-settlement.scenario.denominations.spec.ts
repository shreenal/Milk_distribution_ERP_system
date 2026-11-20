/**
 * Cash Settlement – route denominations.
 * Scenarios: S-72 .. S-78   (spec: CS-7, CS-10.5)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  ok,
  expense,
  denomination,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – route denominations', () => {
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
  const save = async (paperId: number, rows: unknown[]) =>
    cs().save('denominations', paperId, rows, await cs().paperToken(paperId));

  it('S-72 only the routes in the payload are overwritten; other routes and all expenses are untouched', async () => {
    const s = await cs().scene();
    const [a, b] = s.routes;
    await cs().seed('expenses', s.paperId, [expense(a.sheetId, s.type.id, 10)]);
    await cs().seedSettlement(b.sheetId, { note100: 5 });
    ok(
      await save(s.paperId, [
        denomination(a.sheetId, { note500: 2, coins: 1.5 }),
      ]),
    );
    expect(await cs().settlement(a.sheetId)).toMatchObject({ note_500: 2 });
    expect(Number((await cs().settlement(a.sheetId))!.coins)).toBe(1.5);
    expect((await cs().settlement(b.sheetId))!.note_100).toBe(5);
    expect(await cs().expenses(s.paperId)).toHaveLength(1);
  });

  it('S-73 an all-zero entry for a route with no record creates nothing and leaves the token alone', async () => {
    const s = await cs().scene();
    const before = await cs().paperToken(s.paperId);
    const body = ok(
      await cs().save(
        'denominations',
        s.paperId,
        [denomination(s.routes[0].sheetId)],
        before,
      ),
    );
    expect(body.changed).toBe(false);
    expect(await cs().settlements(s.paperId)).toHaveLength(0);
    expect(await cs().paperToken(s.paperId)).toBe(before);
  });

  it('S-74 counts equal to the stored ones are a no-op', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    await cs().seed('denominations', s.paperId, [
      denomination(sheetId, { note200: 3, coins: 2 }),
    ]);
    const before = await cs().paperToken(s.paperId);
    const body = ok(
      await cs().save(
        'denominations',
        s.paperId,
        [denomination(sheetId, { note200: 3, coins: 2 })],
        before,
      ),
    );
    expect(body.changed).toBe(false);
    expect(await cs().paperToken(s.paperId)).toBe(before);
  });

  it('S-75 stored non-zero counts overwritten with all zeros: the record stays with zeros and it counts as a change', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    await cs().seed('denominations', s.paperId, [
      denomination(sheetId, { note500: 2 }),
    ]);
    const body = ok(await save(s.paperId, [denomination(sheetId)]));
    expect(body.changed).toBe(true);
    expect(await cs().settlement(sheetId)).toMatchObject({ note_500: 0 });
  });

  it('S-76 a sheet outside the paper is 400 and nothing is saved', async () => {
    const s = await cs().scene();
    const other = await cs().scene();
    const before = await cs().paperToken(s.paperId);
    const res = await save(s.paperId, [
      denomination(other.routes[0].sheetId, { note10: 1 }),
    ]);
    expect(res.status).toBe(400);
    expect(await cs().settlements(other.paperId)).toHaveLength(0);
    expect(await cs().paperToken(s.paperId)).toBe(before);
  });

  it('S-77 a counted total that differs from route net cash is saved (200); the mismatch only shows in submission', async () => {
    const s = await cs().scene({ routes: [{ cash: 1000 }] });
    const [r] = s.routes;
    const body = ok(
      await save(s.paperId, [denomination(r.sheetId, { note500: 1 })]),
    );
    expect(body.submission.ready).toBe(false);
    expect(body.submission.routeMismatches).toContain(
      MSG.mismatch(r.name, 1000, 500),
    );
    expect(
      body.routeSettlements.find((x: any) => x.sheetId === r.sheetId)
        .difference,
    ).toBe(500);
  });

  it('S-78 an empty denominations array is a valid no-op', async () => {
    const s = await cs().scene();
    const before = await cs().paperToken(s.paperId);
    const body = ok(await cs().save('denominations', s.paperId, [], before));
    expect(body.changed).toBe(false);
    expect(body.cashSettlementUpdatedAt).toBe(before);
  });
});
