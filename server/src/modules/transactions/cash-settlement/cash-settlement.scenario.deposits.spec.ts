/**
 * Cash Settlement – bank deposits.
 * Scenarios: S-90 .. S-96   (spec: CS-9, CS-12.3, DQ1)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  ok,
  depositEntry,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – bank deposits', () => {
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
  const save = async (
    paperId: number,
    rows: unknown[],
    extra: Record<string, unknown> = {},
  ) =>
    cs().save('deposits', paperId, rows, await cs().paperToken(paperId), {
      extra,
    });

  it('S-90 an entry without id is added, with id is updated, an id in deletedDepositIds is removed', async () => {
    const s = await cs().scene();
    const added = ok(
      await save(s.paperId, [
        depositEntry(s.bank.id, { note500: 1 }),
        depositEntry(s.bank.id, { note100: 1 }),
      ]),
    );
    const [first, second] = added.bankDeposits;
    ok(
      await save(s.paperId, [
        depositEntry(s.bank.id, { note500: 3 }, first.id),
      ]),
    );
    let rows = await cs().depositRows(s.paperId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === first.id)!.note_500).toBe(3);
    ok(await save(s.paperId, [], { deletedDepositIds: [second.id] }));
    rows = await cs().depositRows(s.paperId);
    expect(rows.map((r) => r.id)).toEqual([first.id]);
  });

  it('S-91 two deposits to the same bank are allowed', async () => {
    const s = await cs().scene();
    ok(
      await save(s.paperId, [
        depositEntry(s.bank.id, { note10: 1 }),
        depositEntry(s.bank.id, { note10: 1 }),
      ]),
    );
    expect(await cs().depositRows(s.paperId)).toHaveLength(2);
  });

  it('S-92 a new deposit or a changed bank that is unknown or inactive is 400', async () => {
    const s = await cs().scene();
    const inactive = await cs().addBank({ active: false });
    expect(
      (await save(s.paperId, [depositEntry(inactive.id, { note10: 1 })]))
        .status,
    ).toBe(400);
    expect(
      (await save(s.paperId, [depositEntry(2147483647, { note10: 1 })])).status,
    ).toBe(400);
    const dep = (
      await cs().seed('deposits', s.paperId, [
        depositEntry(s.bank.id, { note10: 1 }),
      ])
    ).bankDeposits[0];
    expect(
      (
        await save(s.paperId, [
          depositEntry(inactive.id, { note10: 1 }, dep.id),
        ])
      ).status,
    ).toBe(400);
    expect((await cs().depositRows(s.paperId))[0].bank_id).toBe(s.bank.id);
  });

  it('S-93 an all-zero deposit is stored as sent', async () => {
    const s = await cs().scene();
    ok(await save(s.paperId, [depositEntry(s.bank.id)]));
    const rows = await cs().depositRows(s.paperId);
    expect(rows).toHaveLength(1);
    expect(rows[0].note_500).toBe(0);
  });

  it('S-94 a deposit larger than the available cash is saved (200) and listed in submission.depositProblems', async () => {
    const s = await cs().scene({ routes: [{ cash: 100 }] });
    await cs().seed('denominations', s.paperId, [
      {
        sheetId: s.routes[0].sheetId,
        note100: 1,
        note2000: 0,
        note500: 0,
        note200: 0,
        note50: 0,
        note20: 0,
        note10: 0,
        coins: 0,
      },
    ]);
    const body = ok(
      await save(s.paperId, [depositEntry(s.bank.id, { note100: 2 })]),
    );
    expect(body.submission.ready).toBe(false);
    expect(body.submission.depositProblems).toContain(
      MSG.exceedsCash(100, 200),
    );
    expect(body.submission.depositProblems).toContain(
      MSG.exceedsDenomination('₹100', 1, 2),
    );
    expect(await cs().depositRows(s.paperId)).toHaveLength(1);
  });

  it('S-95 an id of another paper, an unknown id, an id both saved and deleted, or the same id twice: 400', async () => {
    const s = await cs().scene();
    const other = await cs().scene();
    const mine = (
      await cs().seed('deposits', s.paperId, [
        depositEntry(s.bank.id, { note10: 1 }),
      ])
    ).bankDeposits[0];
    const theirs = (
      await cs().seed('deposits', other.paperId, [
        depositEntry(other.bank.id, { note10: 1 }),
      ])
    ).bankDeposits[0];
    const cases: [string, unknown[], Record<string, unknown>][] = [
      ['other paper', [depositEntry(s.bank.id, { note10: 2 }, theirs.id)], {}],
      ['unknown id', [depositEntry(s.bank.id, { note10: 2 }, 2147483647)], {}],
      ['deleted other paper', [], { deletedDepositIds: [theirs.id] }],
      [
        'saved and deleted',
        [depositEntry(s.bank.id, { note10: 2 }, mine.id)],
        { deletedDepositIds: [mine.id] },
      ],
      [
        'same id twice',
        [
          depositEntry(s.bank.id, { note10: 2 }, mine.id),
          depositEntry(s.bank.id, { note10: 3 }, mine.id),
        ],
        {},
      ],
    ];
    for (const [name, rows, extra] of cases) {
      expect((await save(s.paperId, rows, extra)).status, name).toBe(400);
    }
    expect((await cs().depositRows(s.paperId))[0].note_10).toBe(1);
    expect((await cs().depositRows(other.paperId))[0].note_10).toBe(1);
  });

  it('S-96 a saved deposit whose bank was deactivated keeps saving when all rows are sent (DQ1)', async () => {
    const s = await cs().scene();
    const otherBank = await cs().addBank();
    const body = await cs().seed('deposits', s.paperId, [
      depositEntry(s.bank.id, { note10: 1 }),
      depositEntry(otherBank.id, { note10: 1 }),
    ]);
    const [a, b] = body.bankDeposits;
    await cs().setBankActive(s.bank.id, false);
    const res = ok(
      await save(s.paperId, [
        depositEntry(s.bank.id, { note10: 5 }, a.id),
        depositEntry(otherBank.id, { note10: 7 }, b.id),
      ]),
    );
    expect(res.changed).toBe(true);
    const rows = await cs().depositRows(s.paperId);
    expect(rows.find((r) => r.id === a.id)!.note_10).toBe(5);
    expect(rows.find((r) => r.id === b.id)!.note_10).toBe(7);
  });
});
