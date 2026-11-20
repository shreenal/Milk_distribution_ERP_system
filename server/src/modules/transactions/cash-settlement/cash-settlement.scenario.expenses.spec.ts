/**
 * Cash Settlement – route expenses.
 * Scenarios: S-60 .. S-71, S-160, S-161   (spec: CS-6, CS-5.5, CS-4.2, DQ1)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ok,
  expense,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – route expenses', () => {
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
  const save = async (
    paperId: number,
    rows: unknown[],
    extra: Record<string, unknown> = {},
  ) => cs().save('expenses', paperId, rows, await tok(paperId), { extra });

  it('S-60 a line without id is added with an id; only that route gets a settlement record', async () => {
    const s = await cs().scene();
    const body = await cs().seed('expenses', s.paperId, [
      expense(s.routes[0].sheetId, s.type.id, 40),
    ]);
    expect(body.routeExpenses).toHaveLength(1);
    expect(body.routeExpenses[0].id).toEqual(expect.any(Number));
    const records = await cs().settlements(s.paperId);
    expect(records.map((r) => r.order_sheet_id)).toEqual([s.routes[0].sheetId]);
  });

  it('S-61 a line with id and a changed amount is updated in place and keeps its id', async () => {
    const s = await cs().scene();
    const line = (
      await cs().seed('expenses', s.paperId, [
        expense(s.routes[0].sheetId, s.type.id, 40),
      ])
    ).routeExpenses[0];
    const body = ok(
      await save(s.paperId, [
        expense(s.routes[0].sheetId, s.type.id, 55, line.id),
      ]),
    );
    expect(body.changed).toBe(true);
    const rows = await cs().expenses(s.paperId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(line.id);
    expect(Number(rows[0].amount)).toBe(55);
  });

  it('S-62 a line equal to the stored one writes nothing: changed false, token unchanged', async () => {
    const s = await cs().scene();
    const line = (
      await cs().seed('expenses', s.paperId, [
        expense(s.routes[0].sheetId, s.type.id, 40),
      ])
    ).routeExpenses[0];
    const before = await tok(s.paperId);
    const body = ok(
      await cs().save(
        'expenses',
        s.paperId,
        [expense(s.routes[0].sheetId, s.type.id, 40, line.id)],
        before,
      ),
    );
    expect(body.changed).toBe(false);
    expect(body.cashSettlementUpdatedAt).toBe(before);
    expect(await tok(s.paperId)).toBe(before);
  });

  it('S-63 lines and routes that are not in the payload are untouched', async () => {
    const s = await cs().scene();
    const [a, b] = s.routes;
    await cs().seed('expenses', s.paperId, [
      expense(a.sheetId, s.type.id, 10),
      expense(b.sheetId, s.type.id, 20),
    ]);
    const before = await cs().expenses(s.paperId);
    ok(await save(s.paperId, [expense(a.sheetId, s.type.id, 30)]));
    const after = await cs().expenses(s.paperId);
    expect(after).toHaveLength(3);
    for (const old of before)
      expect(after.find((x) => x.id === old.id)).toBeDefined();
  });

  it('S-64 deletedExpenseIds removes only the listed line', async () => {
    const s = await cs().scene();
    const [a] = s.routes;
    const body = await cs().seed('expenses', s.paperId, [
      expense(a.sheetId, s.type.id, 10),
      expense(a.sheetId, s.type.id, 20),
    ]);
    const [first, second] = body.routeExpenses;
    ok(await save(s.paperId, [], { deletedExpenseIds: [first.id] }));
    const rows = await cs().expenses(s.paperId);
    expect(rows.map((r) => r.id)).toEqual([second.id]);
  });

  it("S-65 an unknown id, another paper's id, an id both saved and deleted, or an id sent with another route: 400 with details, nothing saved", async () => {
    const s = await cs().scene();
    const other = await cs().scene();
    const [a, b] = s.routes;
    const mine = (
      await cs().seed('expenses', s.paperId, [
        expense(a.sheetId, s.type.id, 10),
      ])
    ).routeExpenses[0];
    const theirs = (
      await cs().seed('expenses', other.paperId, [
        expense(other.routes[0].sheetId, other.type.id, 10),
      ])
    ).routeExpenses[0];
    const before = await tok(s.paperId);
    const cases: [string, unknown[], Record<string, unknown>][] = [
      ['unknown id', [expense(a.sheetId, s.type.id, 5, 2147483647)], {}],
      ['other paper id', [expense(a.sheetId, s.type.id, 5, theirs.id)], {}],
      ['deleted unknown', [], { deletedExpenseIds: [2147483647] }],
      [
        'saved and deleted',
        [expense(a.sheetId, s.type.id, 5, mine.id)],
        { deletedExpenseIds: [mine.id] },
      ],
      [
        'moved to another route',
        [expense(b.sheetId, s.type.id, 5, mine.id)],
        {},
      ],
    ];
    for (const [name, rows, extra] of cases) {
      const res = await cs().save('expenses', s.paperId, rows, before, {
        extra,
      });
      expect(res.status, name).toBe(400);
      expect(res.body.details, name).toEqual(expect.any(Array));
      expect(res.body.details.length, name).toBeGreaterThan(0);
    }
    expect(await tok(s.paperId)).toBe(before);
    expect(await cs().expenses(s.paperId)).toHaveLength(1);
    expect(Number((await cs().expenses(s.paperId))[0].amount)).toBe(10);
  });

  it('S-66 a sheet outside the paper, or an unknown expense type, is 400', async () => {
    const s = await cs().scene();
    const other = await cs().scene();
    expect(
      (await save(s.paperId, [expense(other.routes[0].sheetId, s.type.id, 5)]))
        .status,
    ).toBe(400);
    expect(
      (await save(s.paperId, [expense(s.routes[0].sheetId, 2147483647, 5)]))
        .status,
    ).toBe(400);
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
  });

  it('S-67 several lines for the same route and type are allowed', async () => {
    const s = await cs().scene();
    const [a] = s.routes;
    ok(
      await save(s.paperId, [
        expense(a.sheetId, s.type.id, 10),
        expense(a.sheetId, s.type.id, 10),
      ]),
    );
    expect(await cs().expenses(s.paperId)).toHaveLength(2);
  });

  it('S-68 amount 0.011 is stored as 0.01; sending the same payload again is a no-op', async () => {
    const s = await cs().scene();
    const [a] = s.routes;
    const line = (
      await cs().seed('expenses', s.paperId, [
        expense(a.sheetId, s.type.id, 0.011),
      ])
    ).routeExpenses[0];
    expect(Number((await cs().expenses(s.paperId))[0].amount)).toBe(0.01);
    const again = ok(
      await save(s.paperId, [expense(a.sheetId, s.type.id, 0.011, line.id)]),
    );
    expect(again.changed).toBe(false);
  });

  it('S-69 a saved line whose type was deactivated later keeps saving, amount changes included (DQ1)', async () => {
    const s = await cs().scene();
    const [a] = s.routes;
    const typeY = await cs().addExpenseType();
    const line = (
      await cs().seed('expenses', s.paperId, [
        expense(a.sheetId, s.type.id, 10),
      ])
    ).routeExpenses[0];
    await cs().setTypeActive(s.type.id, false);
    const body = ok(
      await save(s.paperId, [
        expense(a.sheetId, s.type.id, 77, line.id),
        expense(a.sheetId, typeY.id, 5),
      ]),
    );
    expect(body.changed).toBe(true);
    const rows = await cs().expenses(s.paperId);
    expect(rows).toHaveLength(2);
    expect(Number(rows.find((r) => r.id === line.id)!.amount)).toBe(77);
    expect(rows.find((r) => r.id === line.id)!.expense_type_id).toBe(s.type.id);
  });

  it('S-160 changing a saved line to an inactive type is 400', async () => {
    const s = await cs().scene();
    const [a] = s.routes;
    const inactive = await cs().addExpenseType({ active: false });
    const line = (
      await cs().seed('expenses', s.paperId, [
        expense(a.sheetId, s.type.id, 10),
      ])
    ).routeExpenses[0];
    const res = await save(s.paperId, [
      expense(a.sheetId, inactive.id, 10, line.id),
    ]);
    expect(res.status).toBe(400);
    expect((await cs().expenses(s.paperId))[0].expense_type_id).toBe(s.type.id);
  });

  it('S-161 a new line with an inactive type is 400', async () => {
    const s = await cs().scene();
    const inactive = await cs().addExpenseType({ active: false });
    const res = await save(s.paperId, [
      expense(s.routes[0].sheetId, inactive.id, 10),
    ]);
    expect(res.status).toBe(400);
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
  });

  it("S-70 deleting a route's last expense removes the line; its zero settlement record stays and the route is still listed", async () => {
    const s = await cs().scene();
    const [a] = s.routes;
    const line = (
      await cs().seed('expenses', s.paperId, [
        expense(a.sheetId, s.type.id, 10),
      ])
    ).routeExpenses[0];
    const body = ok(
      await save(s.paperId, [], { deletedExpenseIds: [line.id] }),
    );
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
    expect(await cs().settlements(s.paperId)).toHaveLength(1);
    expect(body.routeExpenses).toHaveLength(0);
    expect(body.routeDenominations.map((r: any) => r.sheetId)).toContain(
      a.sheetId,
    );
  });

  it('S-71 an expense on a route of an inactive group is saved and makes the route visible', async () => {
    const s = await cs().scene({ routes: [{}, { groupActive: false }] });
    const hidden = s.routes[1];
    const before = ok(await cs().get(s.paperId));
    expect(
      before.routeSettlements.some((r: any) => r.sheetId === hidden.sheetId),
    ).toBe(false);
    const body = ok(
      await save(s.paperId, [expense(hidden.sheetId, s.type.id, 25)]),
    );
    expect(
      body.routeSettlements.find((r: any) => r.sheetId === hidden.sheetId),
    ).toMatchObject({ expenseTotal: 25, routeNetCash: -25 });
  });
});
