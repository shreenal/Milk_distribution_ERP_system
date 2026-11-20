/**
 * Cash Settlement – reads (GET /cash-settlement/:paperId).
 * Scenarios: S-10 .. S-27   (spec: CS-2.1, CS-3, CS-4)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  VIEW_KEYS,
  SUBMISSION_KEYS,
  ok,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – reads', () => {
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

  const routeRow = (body: any, sheetId: number) =>
    body.routeSettlements.find((r: any) => r.sheetId === sheetId);

  it('S-10 a missing paper is 404 "Paper not found"', async () => {
    const res = await ctx.cs.get(2147483647);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(MSG.PAPER_NOT_FOUND);
  });

  it('S-11 the response has exactly the documented keys; paper is the fixed subset; the token is the paper updated_at', async () => {
    const s = await ctx.cs.scene();
    const body = ok(await ctx.cs.get(s.paperId));
    expect(Object.keys(body).sort()).toEqual(
      [
        'paper',
        'workflow',
        'cashSettlementUpdatedAt',
        'submission',
        ...VIEW_KEYS.filter((k) => k !== 'submission'),
      ].sort(),
    );
    expect(Object.keys(body.paper).sort()).toEqual([
      'created_at',
      'finalized_at',
      'id',
      'morning_entry_submitted_at',
      'night_entry_submitted_at',
      'order_date',
      'reopen_reason',
      'reopened_at',
      'sale_date',
      'status',
      'updated_at',
    ]);
    expect(body.cashSettlementUpdatedAt).toBe(
      await ctx.cs.paperToken(s.paperId),
    );
    expect(Object.keys(body.submission).sort()).toEqual(
      [...SUBMISSION_KEYS].sort(),
    );
  });

  it('S-12 the read works in every status and workflow.permissions equal the status matrix (CS-2.1)', async () => {
    const s = await ctx.cs.scene();
    const none = {
      canEditRouteExpenses: false,
      canEditRouteDenominations: false,
      canEditDirectCollections: false,
      canEditBankDeposits: false,
    };
    const matrix: Record<string, typeof none> = {
      DRAFT: none,
      NIGHT_SUBMITTED: {
        canEditRouteExpenses: true,
        canEditRouteDenominations: true,
        canEditDirectCollections: true,
        canEditBankDeposits: true,
      },
      MORNING_SUBMITTED: none,
      FINALIZED: none,
      REOPENED: {
        canEditRouteExpenses: true,
        canEditRouteDenominations: true,
        canEditDirectCollections: false,
        canEditBankDeposits: false,
      },
    };
    for (const [status, permissions] of Object.entries(matrix)) {
      await ctx.cs.setStatus(s.paperId, status);
      const body = ok(await ctx.cs.get(s.paperId));
      expect(body.workflow.status, status).toBe(status);
      expect(body.workflow.permissions, status).toEqual(permissions);
    }
  });

  it('S-13 route cash is cash_collection only, MILK and NON_MILK together; office, cheque, online and bank amounts are ignored', async () => {
    const s = await ctx.cs.scene({ routes: [{}] });
    const [r] = s.routes;
    await ctx.cs.seedCash(r.sheetId, r.client.id, 100, 'MILK', {
      office_cash_collection: 999,
      cheque_collection: 111,
      online_collection: 222,
      bank_deposit: 333,
    });
    await ctx.cs.seedCash(r.sheetId, r.client.id, 50, 'NON_MILK', {
      office_cash_collection: 7,
      cheque_collection: 8,
    });
    const row = routeRow(ok(await ctx.cs.get(s.paperId)), r.sheetId);
    expect(row.routeCash).toBe(150);
  });

  it('S-14 expense total is the sum of the lines, net cash = cash − expenses, and net can be negative', async () => {
    const s = await ctx.cs.scene({ routes: [{ cash: 1000 }, { cash: 100 }] });
    const [a, b] = s.routes;
    await ctx.cs.seedExpense(a.sheetId, s.type.id, 300);
    await ctx.cs.seedExpense(a.sheetId, s.type.id, 200);
    await ctx.cs.seedExpense(b.sheetId, s.type.id, 250);
    const body = ok(await ctx.cs.get(s.paperId));
    expect(routeRow(body, a.sheetId)).toMatchObject({
      expenseTotal: 500,
      routeNetCash: 500,
    });
    expect(routeRow(body, b.sheetId)).toMatchObject({
      expenseTotal: 250,
      routeNetCash: -150,
    });
  });

  it('S-15 denomination amount = notes × face value + coins; a route with no settlement record counts 0', async () => {
    const s = await ctx.cs.scene();
    const [a, b] = s.routes;
    await ctx.cs.seedSettlement(a.sheetId, {
      note2000: 2,
      note500: 1,
      note100: 3,
      coins: 25.5,
    });
    const body = ok(await ctx.cs.get(s.paperId));
    expect(routeRow(body, a.sheetId).denominationTotal).toBe(4825.5);
    expect(routeRow(body, b.sheetId).denominationTotal).toBe(0);
  });

  it('S-16 difference per route = net cash − counted', async () => {
    const s = await ctx.cs.scene({ routes: [{ cash: 700 }, { cash: 1000 }] });
    const [a, b] = s.routes;
    await ctx.cs.seedSettlement(a.sheetId, { note500: 1 });
    await ctx.cs.seedSettlement(b.sheetId, { note500: 2 });
    const body = ok(await ctx.cs.get(s.paperId));
    expect(routeRow(body, a.sheetId).difference).toBe(200);
    expect(routeRow(body, b.sheetId).difference).toBe(0);
  });

  it.each(['DRAFT', 'NIGHT_SUBMITTED', 'MORNING_SUBMITTED', 'FINALIZED'])(
    'S-17 %s: normal summary shape and figures',
    async (status) => {
      const s = await ctx.cs.scene({ status, routes: [{ cash: 1000 }] });
      await ctx.cs.seedExpense(s.routes[0].sheetId, s.type.id, 100);
      await ctx.cs.seedDirect(s.paperId, s.employee.id, { note500: 2 });
      await ctx.cs.seedDeposit(s.paperId, s.bank.id, { note500: 1 });
      const { summary } = ok(await ctx.cs.get(s.paperId));
      expect(Object.keys(summary).sort()).toEqual([
        'cashInHandAfterDeposits',
        'directCollectionCash',
        'officeCash',
        'totalDeposits',
        'totalRouteCash',
        'totalRouteExpenses',
        'totalRouteNetCash',
      ]);
      expect(summary).toMatchObject({
        totalRouteCash: 1000,
        totalRouteExpenses: 100,
        totalRouteNetCash: 900,
        directCollectionCash: 1000,
        officeCash: 1900,
        totalDeposits: 500,
        cashInHandAfterDeposits: 1400,
      });
    },
  );

  it('S-18 REOPENED: historical / revised summary; the difference equals total net cash − total counted', async () => {
    const s = await ctx.cs.scene({
      status: 'REOPENED',
      routes: [{ cash: 700 }],
    });
    await ctx.cs.seedSettlement(s.routes[0].sheetId, { note500: 1 });
    await ctx.cs.seedDirect(s.paperId, s.employee.id, { note100: 1 });
    await ctx.cs.seedDeposit(s.paperId, s.bank.id, { note100: 1 });
    const { summary } = ok(await ctx.cs.get(s.paperId));
    expect(Object.keys(summary).sort()).toEqual([
      'historicalCashOnHand',
      'historicalDirectCollectionCash',
      'historicalRouteDenominationCash',
      'reconciliationDifference',
      'revisedCashOnHand',
      'revisedOfficeCash',
      'totalDeposits',
      'totalRouteCash',
      'totalRouteExpenses',
      'totalRouteNetCash',
    ]);
    expect(summary).toMatchObject({
      totalRouteNetCash: 700,
      historicalRouteDenominationCash: 500,
      historicalDirectCollectionCash: 100,
      revisedOfficeCash: 800,
      totalDeposits: 100,
      revisedCashOnHand: 700,
      historicalCashOnHand: 500,
      reconciliationDifference: 200,
    });
  });

  it('S-19 FINALIZED (after a re-finalize): normal summary, no reconciliationDifference; submission still lists the mismatch (DQ9)', async () => {
    const s = await ctx.cs.scene({
      status: 'FINALIZED',
      routes: [{ cash: 700 }],
    });
    await ctx.cs.seedSettlement(s.routes[0].sheetId, { note500: 1 });
    const body = ok(await ctx.cs.get(s.paperId));
    expect(body.summary).not.toHaveProperty('reconciliationDifference');
    expect(body.summary).toHaveProperty('officeCash');
    expect(body.submission.ready).toBe(false);
    expect(body.submission.routeMismatches).toContain(
      MSG.mismatch(s.routes[0].name, 700, 500),
    );
  });

  it('S-20 every route appears, even with nothing entered', async () => {
    const s = await ctx.cs.scene({ routes: [{}, {}, {}] });
    const body = ok(await ctx.cs.get(s.paperId));
    expect(body.routeSettlements.map((r: any) => r.sheetId).sort()).toEqual(
      s.routes.map((r) => r.sheetId).sort(),
    );
    for (const r of body.routeSettlements) {
      expect(r).toMatchObject({
        routeCash: 0,
        expenseTotal: 0,
        routeNetCash: 0,
        denominationTotal: 0,
        difference: 0,
      });
    }
  });

  it('S-21 a route of an inactive group with nothing recorded is hidden and changes no total or gate result', async () => {
    const s = await ctx.cs.scene({
      routes: [{ cash: 100 }, { groupActive: false }],
    });
    const hidden = s.routes[1];
    const body = ok(await ctx.cs.get(s.paperId));
    expect(routeRow(body, hidden.sheetId)).toBeUndefined();
    expect(routeRow(body, s.routes[0].sheetId)).toBeDefined();
    expect(body.summary.totalRouteCash).toBe(100);
    expect(body.submission.routeMismatches.join('|')).not.toContain(
      hidden.name,
    );
  });

  it("S-22 an inactive group's route stays visible when it has cash, an expense or counted notes", async () => {
    const s = await ctx.cs.scene({
      routes: [
        {},
        { groupActive: false, cash: 100 },
        { groupActive: false },
        { groupActive: false },
        { groupActive: false },
      ],
    });
    const [, withCash, withExpense, withCount, empty] = s.routes;
    await ctx.cs.seedExpense(withExpense.sheetId, s.type.id, 10);
    await ctx.cs.seedSettlement(withCount.sheetId, { note10: 1 });
    const body = ok(await ctx.cs.get(s.paperId));
    for (const r of [withCash, withExpense, withCount])
      expect(routeRow(body, r.sheetId), r.name).toBeDefined();
    expect(routeRow(body, empty.sheetId)).toBeUndefined();
  });

  it('S-23 a hidden route appears once a Collections save puts positive cash on its sheet', async () => {
    const s = await ctx.cs.scene({ routes: [{}, { groupActive: false }] });
    const hidden = s.routes[1];
    expect(
      routeRow(ok(await ctx.cs.get(s.paperId)), hidden.sheetId),
    ).toBeUndefined();
    await ctx.cs.seedCash(hidden.sheetId, hidden.client.id, 40);
    const body = ok(await ctx.cs.get(s.paperId));
    expect(routeRow(body, hidden.sheetId)).toMatchObject({
      routeCash: 40,
      difference: 40,
    });
    expect(body.submission.routeMismatches).toContain(
      MSG.mismatch(hidden.name, 40, 0),
    );
  });

  it('S-24 expenses carry stable ids; routeDenominations lists only routes with a record; direct and deposit rows carry computed amounts', async () => {
    const s = await ctx.cs.scene({ routes: [{ cash: 100 }, {}] });
    const [a, b] = s.routes;
    const line = await ctx.cs.seedExpense(a.sheetId, s.type.id, 30);
    await ctx.cs.seedDirect(s.paperId, s.employee.id, { note500: 1, coins: 5 });
    await ctx.cs.seedDeposit(s.paperId, s.bank.id, { note200: 2 });
    const body = ok(await ctx.cs.get(s.paperId));
    expect(body.routeExpenses).toEqual([
      {
        id: line.id,
        sheetId: a.sheetId,
        routeName: a.name,
        expenseTypeId: s.type.id,
        expenseTypeName: s.type.name,
        amount: 30,
      },
    ]);
    expect(body.routeDenominations.map((r: any) => r.sheetId)).toEqual([
      a.sheetId,
    ]);
    expect(body.routeDenominations.map((r: any) => r.sheetId)).not.toContain(
      b.sheetId,
    );
    expect(body.directCollections[0]).toMatchObject({
      employeeId: s.employee.id,
      employeeName: s.employee.name,
      collectionAmount: 505,
    });
    expect(body.bankDeposits[0]).toMatchObject({
      bankId: s.bank.id,
      bankName: s.bank.name,
      depositAmount: 400,
    });
  });

  it('S-25 amounts 0.1 and 0.2 add up exactly (0.30), 2 dp half-up', async () => {
    const s = await ctx.cs.scene({ routes: [{ cash: 0.1 }] });
    const r = s.routes[0];
    const second = await ctx.world.addClient({ group: r.group });
    await ctx.cs.seedCash(r.sheetId, second.id, 0.2);
    const body = ok(await ctx.cs.get(s.paperId));
    expect(routeRow(body, r.sheetId).routeCash).toBe(0.3);
    expect(body.summary.totalRouteCash).toBe(0.3);
  });

  it('S-26 nothing is carried over from an earlier paper (no opening balance)', async () => {
    const earlier = await ctx.cs.scene({ routes: [{ cash: 500 }] });
    await ctx.cs.seedDirect(earlier.paperId, earlier.employee.id, {
      note500: 4,
    });
    await ctx.cs.seedDeposit(earlier.paperId, earlier.bank.id, { note500: 1 });
    const later = await ctx.cs.scene({ routes: [{}] });
    const { summary } = ok(await ctx.cs.get(later.paperId));
    expect(summary).toMatchObject({
      totalRouteCash: 0,
      directCollectionCash: 0,
      officeCash: 0,
      totalDeposits: 0,
      cashInHandAfterDeposits: 0,
    });
  });

  it('S-27 the submission block equals what the gate would say, and never blocks the read', async () => {
    const s = await ctx.cs.scene({ routes: [{ cash: 700 }] });
    const [r] = s.routes;
    let body = ok(await ctx.cs.get(s.paperId));
    expect(body.submission).toEqual({
      ready: false,
      routeMismatches: [MSG.mismatch(r.name, 700, 0)],
      depositProblems: [],
    });
    expect((await ctx.cs.gate(s.paperId))?.details).toEqual(
      body.submission.routeMismatches,
    );
    await ctx.cs.seedSettlement(r.sheetId, { note500: 1, note200: 1 });
    body = ok(await ctx.cs.get(s.paperId));
    expect(body.submission).toEqual({
      ready: true,
      routeMismatches: [],
      depositProblems: [],
    });
    expect(await ctx.cs.gate(s.paperId)).toBeNull();
  });
});
