/**
 * Cash Settlement – submission and finalization gates (called by Paper).
 * Scenarios: S-130 .. S-141   (spec: CS-12, CS-4.2, PA-7.2, PA-8.3, PA-8.6, PA-8.9, PA-19.3)
 *
 * The gate is called directly through CashSettlementValidationService.validateMorningSubmitReadiness (what Paper
 * calls); S-137 .. S-139 observe the same gates through GET /papers/:id/readiness.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  ok,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – gates', () => {
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

  it('S-130 net equals counted passes; a route with no cash, no expenses and no counts passes', async () => {
    const s = await cs().scene({ routes: [{ cash: 700 }, {}] });
    await cs().seedSettlement(s.routes[0].sheetId, { note500: 1, note200: 1 });
    expect(await cs().gate(s.paperId)).toBeNull();
  });

  it('S-131 a mismatch in either direction is listed per route with the documented text', async () => {
    const s = await cs().scene({ routes: [{ cash: 1000 }, { cash: 500 }] });
    const [a, b] = s.routes;
    await cs().seedSettlement(a.sheetId, { note500: 1 });
    await cs().seedSettlement(b.sheetId, { note500: 2 });
    const result = await cs().gate(s.paperId);
    expect(result?.status).toBe(400);
    expect(result?.message).toBe(MSG.NOT_READY);
    expect(result?.details).toContain(MSG.mismatch(a.name, 1000, 500));
    expect(result?.details).toContain(MSG.mismatch(b.name, 500, 1000));
  });

  it('S-132 a negative net cash can never match and blocks submission', async () => {
    const s = await cs().scene({ routes: [{}] });
    await cs().seedExpense(s.routes[0].sheetId, s.type.id, 50);
    const result = await cs().gate(s.paperId);
    expect(result?.details).toContain(MSG.mismatch(s.routes[0].name, -50, 0));
  });

  it('S-133 total deposits above office cash: "Bank deposits exceed available office cash"', async () => {
    const s = await cs().scene({ routes: [{ cash: 100 }] });
    await cs().seedSettlement(s.routes[0].sheetId, { note100: 1 });
    await cs().seedDeposit(s.paperId, s.bank.id, { note100: 2 });
    const result = await cs().gate(s.paperId);
    expect(result?.details).toContain(MSG.exceedsCash(100, 200));
  });

  it('S-134 each denomination and coins are checked against route counts plus direct collections', async () => {
    const s = await cs().scene({ routes: [{ cash: 1010 }] });
    await cs().seedSettlement(s.routes[0].sheetId, { note500: 2, coins: 10 });
    await cs().seedDirect(s.paperId, s.employee.id, { note500: 0 });
    await cs().seedDeposit(s.paperId, s.bank.id, { note500: 3, coins: 25 });
    const result = await cs().gate(s.paperId);
    expect(result?.details).toContain(MSG.exceedsDenomination('₹500', 2, 3));
    expect(result?.details).toContain(MSG.exceedsDenomination('coins', 10, 25));
    // direct collections add to what is available: with 1 more ₹500 collected the ₹500 check passes
    await cs().seedDirect(s.paperId, (await cs().addEmployee()).id, {
      note500: 1,
    });
    const after = await cs().gate(s.paperId);
    expect(after?.details.join('|')).not.toContain('₹500 count');
  });

  it('S-135 several problems are reported together in one 400 {message, details[]}', async () => {
    const s = await cs().scene({ routes: [{ cash: 1000 }, { cash: 100 }] });
    const [a, b] = s.routes;
    await cs().seedSettlement(a.sheetId, { note500: 1 });
    await cs().seedSettlement(b.sheetId, { note200: 1 });
    await cs().seedDeposit(s.paperId, s.bank.id, { note500: 2 });
    const result = await cs().gate(s.paperId);
    expect(result?.status).toBe(400);
    expect(result?.message).toBe(MSG.NOT_READY);
    expect(result?.details).toEqual(
      expect.arrayContaining([
        MSG.mismatch(a.name, 1000, 500),
        MSG.mismatch(b.name, 100, 200),
        MSG.exceedsDenomination('₹500', 1, 2),
      ]),
    );
    expect(result!.details.length).toBeGreaterThanOrEqual(3);
  });

  it('S-136 a route of an inactive group with no money is in neither the screen, the totals nor the gate', async () => {
    const s = await cs().scene({
      routes: [{ cash: 100 }, { groupActive: false }],
    });
    await cs().seedSettlement(s.routes[0].sheetId, { note100: 1 });
    const body = ok(await cs().get(s.paperId));
    expect(body.routeSettlements.map((r: any) => r.sheetId)).toEqual([
      s.routes[0].sheetId,
    ]);
    expect(body.submission.ready).toBe(true);
    expect(await cs().gate(s.paperId)).toBeNull();
  });

  it("S-137 morning-submit readiness lists the cash problem together with other modules' problems", async () => {
    const s = await cs().scene({
      status: 'NIGHT_SUBMITTED',
      routes: [{ cash: 700 }],
    });
    const body = ok(await cs().readiness(s.paperId));
    expect(body.action).toBe('SUBMIT_MORNING');
    expect(body.ready).toBe(false);
    expect(body.problems).toContain(MSG.mismatch(s.routes[0].name, 700, 0));
    expect(body.problems.length).toBeGreaterThan(1); // sheets without order lines are reported in the same list
    expect(await cs().gate(s.paperId)).not.toBeNull();
  });

  it('S-138 re-finalize of a REOPENED paper: route mismatch and excess deposits are warnings "Cash settlement: …", never problems', async () => {
    const s = await cs().scene({ status: 'REOPENED', routes: [{ cash: 700 }] });
    await cs().seedSettlement(s.routes[0].sheetId, { note500: 1 });
    await cs().seedDeposit(s.paperId, s.bank.id, { note500: 2 });
    const body = ok(await cs().readiness(s.paperId));
    expect(body.action).toBe('FINALIZE');
    expect(body.warnings).toContain(
      `Cash settlement: ${MSG.mismatch(s.routes[0].name, 700, 500)}`,
    );
    expect(
      body.warnings.some((w: string) =>
        w.startsWith('Cash settlement: Bank deposit'),
      ),
    ).toBe(true);
    expect(
      body.problems.some(
        (p: string) =>
          p.includes('cash mismatch') || p.includes('Bank deposit'),
      ),
    ).toBe(false);
  });

  it('S-139 finalize of a MORNING_SUBMITTED paper has no cash check', async () => {
    const s = await cs().scene({
      status: 'MORNING_SUBMITTED',
      routes: [{ cash: 700 }],
    });
    const body = ok(await cs().readiness(s.paperId));
    expect(body.action).toBe('FINALIZE');
    expect(JSON.stringify([...body.problems, ...body.warnings])).not.toContain(
      'cash mismatch',
    );
    expect(JSON.stringify([...body.problems, ...body.warnings])).not.toContain(
      'Cash settlement',
    );
  });

  it('S-140 cheque, online, office cash and bank-deposit amounts of collections never enter the bankable pool', async () => {
    const s = await cs().scene({ routes: [{}] });
    const [r] = s.routes;
    await cs().seedCash(r.sheetId, r.client.id, 0, 'MILK', {
      office_cash_collection: 500,
      cheque_collection: 500,
      online_collection: 500,
      bank_deposit: 500,
    });
    await cs().seedDeposit(s.paperId, s.bank.id, { note500: 1 });
    const result = await cs().gate(s.paperId);
    expect(result?.details).toContain(MSG.exceedsCash(0, 500));
    expect(result?.details).toContain(MSG.exceedsDenomination('₹500', 0, 1));
  });

  it('S-141 check (a) uses book net cash and check (b) counted notes, so they can disagree while a route mismatches', async () => {
    const s = await cs().scene({ routes: [{ cash: 1000 }] });
    await cs().seedSettlement(s.routes[0].sheetId, { note500: 1 });
    await cs().seedDeposit(s.paperId, s.bank.id, { note500: 2 }); // 1000 deposited = 1000 book cash, but 2 > 1 counted
    const result = await cs().gate(s.paperId);
    expect(result?.details.join('|')).not.toContain(
      'exceed available office cash',
    );
    expect(result?.details).toContain(MSG.exceedsDenomination('₹500', 1, 2));
    expect(result?.details).toContain(
      MSG.mismatch(s.routes[0].name, 1000, 500),
    );
  });
});
