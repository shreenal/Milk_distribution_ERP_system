/**
 * Cash Settlement – save validation and token (all four saves).
 * Scenarios: S-30 .. S-45   (spec: CS-5, CS-10.1, CS-10.4, CS-2.2)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DENOM_FIELDS,
  MSG,
  SECTIONS,
  ok,
  expense,
  denomination,
  directEntry,
  depositEntry,
  createCashTestContext,
  type CashCtx,
  type Section,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – validation and token', () => {
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
  const DENOM_SECTIONS: Section[] = ['denominations', 'direct', 'deposits'];

  it.each(SECTIONS)(
    'S-30 %s: expectedUpdatedAt omitted is 400',
    async (section) => {
      const s = await cs().scene();
      const res = await cs().save(section, s.paperId, [], undefined);
      expect(res.status).toBe(400);
    },
  );

  it.each(SECTIONS)(
    'S-31 %s: token "abc", 123 and "" are 400 "Invalid expectedUpdatedAt"',
    async (section) => {
      const s = await cs().scene();
      for (const bad of ['abc', 123, '']) {
        const res = await cs().save(section, s.paperId, [], bad as never);
        expect(res.status, String(bad)).toBe(400);
      }
      const res = await cs().save(section, s.paperId, [], 'abc');
      expect(JSON.stringify(res.body.message)).toContain(MSG.INVALID_TOKEN);
    },
  );

  it.each(SECTIONS)(
    'S-32 %s: explicit null is always 409 (a paper always has a token)',
    async (section) => {
      const s = await cs().scene();
      const res = await cs().save(section, s.paperId, [], null);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(MSG.STALE);
    },
  );

  it.each(SECTIONS)(
    'S-33 %s: a well-formed token that differs, or a date-only value, is 409',
    async (section) => {
      const s = await cs().scene();
      const current = await cs().paperToken(s.paperId);
      const other = new Date(
        new Date(current).getTime() - 60_000,
      ).toISOString();
      for (const token of [other, '2026-10-01']) {
        const res = await cs().save(section, s.paperId, [], token);
        expect(res.status, token).toBe(409);
        expect(res.body.message).toBe(MSG.STALE);
      }
    },
  );

  it.each(SECTIONS)(
    'S-34 %s: matching token and a real change → 200, changed true, a strictly later token',
    async (section) => {
      const s = await cs().scene();
      const before = await cs().paperToken(s.paperId);
      const body = ok(
        await cs().save(
          section,
          s.paperId,
          [cs().changing(section, s)],
          before,
        ),
      );
      expect(body.changed).toBe(true);
      expect(new Date(body.cashSettlementUpdatedAt).getTime()).toBeGreaterThan(
        new Date(before).getTime(),
      );
      expect(body.cashSettlementUpdatedAt).toBe(
        await cs().paperToken(s.paperId),
      );
    },
  );

  it.each(DENOM_SECTIONS)(
    'S-35 %s: note counts 0 and 100000 accepted; 100001, -1, 1.5 and "5" rejected',
    async (section) => {
      const s = await cs().scene();
      for (const v of [0, 100000]) {
        const res = await cs().save(
          section,
          s.paperId,
          [cs().entryFor(section, s, { note10: v })],
          await cs().paperToken(s.paperId),
        );
        expect(res.status, `ok ${v}`).toBe(200);
      }
      for (const v of [100001, -1, 1.5, '5']) {
        const res = await cs().save(
          section,
          s.paperId,
          [cs().entryFor(section, s, { note10: v as never })],
          await cs().paperToken(s.paperId),
        );
        expect(res.status, `bad ${String(v)}`).toBe(400);
      }
    },
  );

  it.each(DENOM_SECTIONS)(
    'S-36 %s: coins 0 and 100000 accepted; negative and string rejected',
    async (section) => {
      const s = await cs().scene();
      for (const v of [0, 100000]) {
        const res = await cs().save(
          section,
          s.paperId,
          [cs().entryFor(section, s, { coins: v })],
          await cs().paperToken(s.paperId),
        );
        expect(res.status, `ok ${v}`).toBe(200);
      }
      for (const v of [-1, '5']) {
        const res = await cs().save(
          section,
          s.paperId,
          [cs().entryFor(section, s, { coins: v as never })],
          await cs().paperToken(s.paperId),
        );
        expect(res.status, `bad ${String(v)}`).toBe(400);
      }
    },
  );

  it('S-36b coins 10.005 are NOT rejected: stored as 10.01 and resending is a no-op (CS-5.5)', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    ok(
      await cs().save(
        'denominations',
        s.paperId,
        [denomination(sheetId, { coins: 10.005 })],
        await cs().paperToken(s.paperId),
      ),
    );
    expect(Number((await cs().settlement(sheetId))!.coins)).toBe(10.01);
    const again = ok(
      await cs().save(
        'denominations',
        s.paperId,
        [denomination(sheetId, { coins: 10.005 })],
        await cs().paperToken(s.paperId),
      ),
    );
    expect(again.changed).toBe(false);
  });

  it('S-37 expense amount 0.01 and 10,000,000 accepted; 0, 0.005, -1 and 10,000,000.01 rejected', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    for (const v of [0.01, 10_000_000]) {
      const res = await cs().save(
        'expenses',
        s.paperId,
        [expense(sheetId, s.type.id, v)],
        await cs().paperToken(s.paperId),
      );
      expect(res.status, `ok ${v}`).toBe(200);
    }
    for (const v of [0, 0.005, -1, 10_000_000.01]) {
      const res = await cs().save(
        'expenses',
        s.paperId,
        [expense(sheetId, s.type.id, v)],
        await cs().paperToken(s.paperId),
      );
      expect(res.status, `bad ${v}`).toBe(400);
    }
  });

  it('S-38 arrays of 1000 items accepted, 1001 rejected; empty arrays are valid', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    const lines = (n: number) =>
      Array.from({ length: n }, () => expense(sheetId, s.type.id, 1));
    ok(
      await cs().save(
        'expenses',
        s.paperId,
        [],
        await cs().paperToken(s.paperId),
      ),
    );
    ok(
      await cs().save(
        'expenses',
        s.paperId,
        lines(1000),
        await cs().paperToken(s.paperId),
      ),
    );
    expect(await cs().expenses(s.paperId)).toHaveLength(1000);
    const res = await cs().save(
      'expenses',
      s.paperId,
      lines(1001),
      await cs().paperToken(s.paperId),
    );
    expect(res.status).toBe(400);
    expect(await cs().expenses(s.paperId)).toHaveLength(1000);
  });

  it.each(DENOM_SECTIONS)(
    'S-39 %s: an entry missing any one of the eight denomination fields is 400',
    async (section) => {
      const s = await cs().scene();
      for (const field of DENOM_FIELDS) {
        const entry: Record<string, unknown> = {
          ...(cs().entryFor(section, s, { note100: 1 }) as object),
        };
        delete entry[field];
        const res = await cs().save(
          section,
          s.paperId,
          [entry],
          await cs().paperToken(s.paperId),
        );
        expect(res.status, `${section} without ${field}`).toBe(400);
      }
    },
  );

  it('S-40 duplicates in one request are 400: same route, same expense id, same deposit id, same employee', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    const t = () => cs().paperToken(s.paperId);

    const dupRoute = await cs().save(
      'denominations',
      s.paperId,
      [denomination(sheetId), denomination(sheetId, { note10: 1 })],
      await t(),
    );
    expect(dupRoute.status).toBe(400);
    expect(dupRoute.body.message).toContain('Duplicate route entries found');

    const line = (
      await cs().seed('expenses', s.paperId, [expense(sheetId, s.type.id, 5)])
    ).routeExpenses[0];
    const dupExpense = await cs().save(
      'expenses',
      s.paperId,
      [
        expense(sheetId, s.type.id, 6, line.id),
        expense(sheetId, s.type.id, 7, line.id),
      ],
      await t(),
    );
    expect(dupExpense.status).toBe(400);
    expect(dupExpense.body.message).toContain('Duplicate');

    const dep = (
      await cs().seed('deposits', s.paperId, [
        depositEntry(s.bank.id, { note10: 1 }),
      ])
    ).bankDeposits[0];
    const dupDeposit = await cs().save(
      'deposits',
      s.paperId,
      [
        depositEntry(s.bank.id, { note10: 2 }, dep.id),
        depositEntry(s.bank.id, { note10: 3 }, dep.id),
      ],
      await t(),
    );
    expect(dupDeposit.status).toBe(400);
    expect(dupDeposit.body.message).toContain('Duplicate');

    const dupEmployee = await cs().save(
      'direct',
      s.paperId,
      [
        directEntry(s.employee.id, { note10: 1 }),
        directEntry(s.employee.id, { note10: 2 }),
      ],
      await t(),
    );
    expect(dupEmployee.status).toBe(400);
    expect(dupEmployee.body.message).toContain(
      'Duplicate employee entries found',
    );
  });

  it.each([
    ['expenses', 'deletedExpenseIds'],
    ['direct', 'deletedEmployeeIds'],
    ['deposits', 'deletedDepositIds'],
  ] as const)(
    'S-41 %s: duplicate ids inside %s are 400',
    async (section, key) => {
      const s = await cs().scene();
      const res = await cs().save(
        section,
        s.paperId,
        [],
        await cs().paperToken(s.paperId),
        { extra: { [key]: [5, 5] } },
      );
      expect(res.status).toBe(400);
    },
  );

  it('S-42 a duplicate entry together with a missing paper is 400 (checked before the transaction)', async () => {
    const s = await cs().scene();
    const sheetId = s.routes[0].sheetId;
    const res = await cs().save(
      'denominations',
      2147483647,
      [denomination(sheetId), denomination(sheetId)],
      new Date().toISOString(),
    );
    expect(res.status).toBe(400);
  });

  it('S-43 missing paper with a stale token is 404; wrong status with a stale token is 400', async () => {
    const missing = await cs().save(
      'expenses',
      2147483647,
      [],
      new Date(0).toISOString(),
    );
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe(MSG.PAPER_NOT_FOUND);

    const s = await cs().scene({ status: 'FINALIZED' });
    const wrong = await cs().save(
      'expenses',
      s.paperId,
      [],
      new Date(0).toISOString(),
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe(MSG.NOT_ALLOWED);
  });

  it.each(SECTIONS)(
    'S-44 %s: a stale token with an otherwise no-op payload is 409',
    async (section) => {
      const s = await cs().scene();
      const res = await cs().save(
        section,
        s.paperId,
        [],
        new Date(0).toISOString(),
      );
      expect(res.status).toBe(409);
    },
  );

  it('S-45 a stale token together with a sheet outside the paper is 409 (token before request checks)', async () => {
    const s = await cs().scene();
    const other = await cs().scene();
    const foreign = other.routes[0].sheetId;
    const stale = new Date(0).toISOString();
    expect(
      (
        await cs().save(
          'denominations',
          s.paperId,
          [denomination(foreign, { note10: 1 })],
          stale,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await cs().save(
          'expenses',
          s.paperId,
          [expense(foreign, s.type.id, 1)],
          stale,
        )
      ).status,
    ).toBe(409);
    // control: with the current token the same entry is a 400
    expect(
      (
        await cs().save(
          'denominations',
          s.paperId,
          [denomination(foreign, { note10: 1 })],
          await cs().paperToken(s.paperId),
        )
      ).status,
    ).toBe(400);
  });
});
