/**
 * Dairy Trays: save of returns (order of checks, token, atomicity, balance rules, inactive entities).
 * Scenarios DY-40 to DY-69 and DY-150 to DY-154 (behavioral spec sections C3, C4, F4, F5).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import {
  DT_DISCREPANCY,
  DT_EDIT_NOT_ALLOWED,
  DT_NO_HEADER,
  DT_RETURNS_REJECTED,
  DT_SAVED,
  STALE_DT,
  addVehicle,
  buyTrays,
  cleanupDtTests,
  dairyRows,
  dtApi,
  dtHeader,
  dtPaper,
  dtRow,
  dtToken,
  forwardJobs,
  ledgerScene,
  re,
  rebuildLedger,
  setStoredReturn,
  setTrayActive,
  setVehicleActive,
  vname,
} from '../../../../test/helper/dairy-trays-helpers.js';

const text = (r: { body: unknown }) => JSON.stringify(r.body);

let ctx: OrdersCtx;
let dt: ReturnType<typeof dtApi>;
beforeAll(async () => {
  ctx = await createOrdersTestContext({ modules: [DairyTraysModule] });
  dt = dtApi(ctx);
});
afterAll(() => ctx.close());
afterEach(() => cleanupDtTests(ctx));

type Scene = Awaited<ReturnType<typeof ledgerScene>>;
const snapshot = async (s: Scene) => ({
  token: await s.token(),
  rows: JSON.stringify(await dairyRows(ctx, s.paperId)),
});
const returnedOf = async (s: Scene, v = s.v) =>
  (await dtRow(ctx, s.paperId, v, s.trayTypeId))?.trays_returned;

describe('DY-40 to DY-42 order of checks', () => {
  it.each(['DRAFT', 'MORNING_SUBMITTED', 'FINALIZED'])(
    'DY-40: paper %s is 400 "cannot be edited" even with a stale token; nothing changes',
    async (status) => {
      const s = await ledgerScene(ctx, { status });
      const before = await snapshot(s);
      const r = await dt.save(
        s.paperId,
        [re(s.v, s.trayTypeId, 1)],
        '2000-01-01',
      );
      expect(r.status, text(r)).toBe(400);
      expect(text(r)).toContain(DT_EDIT_NOT_ALLOWED);
      expect(await snapshot(s)).toEqual(before);
    },
  );

  it('DY-41: editable status and no header is 400 "has not been generated", before the token check', async () => {
    const sheet = await dtPaper(ctx, 0, 'NIGHT_SUBMITTED', { header: false });
    const v = await addVehicle(ctx);
    for (const expected of [null, new Date().toISOString()]) {
      const r = await dt.save(sheet.paperId, [re(v, 1, 1)], expected);
      expect(r.status, text(r)).toBe(400);
      expect(text(r)).toContain(DT_NO_HEADER);
    }
    expect(await dtHeader(ctx, sheet.paperId)).toBeNull();
  });

  it('DY-42: a null or stale token wins over an invalid entry (409)', async () => {
    const s = await ledgerScene(ctx);
    const overBalance = [re(s.v, s.trayTypeId, 999)];
    for (const expected of [null, '2000-01-01T00:00:00.000Z']) {
      const r = await dt.save(s.paperId, overBalance, expected);
      expect(r.status, text(r)).toBe(409);
      expect(text(r)).toContain(STALE_DT);
    }
  });
});

describe('DY-43 to DY-48 successful save', () => {
  it('DY-43 and DY-152: a valid save returns the contract, stores the line and moves the token once', async () => {
    const s = await ledgerScene(ctx);
    const old = (await s.token())!;
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 4)], old);
    expect(r.status, text(r)).toBe(200);
    expect(r.body).toMatchObject({
      success: true,
      changed: true,
      message: DT_SAVED,
    });
    const stored = await s.token();
    expect(r.body.dairyTraysUpdatedAt).toBe(stored);
    expect(new Date(stored!).getTime()).toBeGreaterThan(
      new Date(old).getTime(),
    );
    expect(await dtRow(ctx, s.paperId, s.v, s.trayTypeId)).toMatchObject({
      opening_balance: 0,
      trays_taken: 10,
      trays_returned: 4,
      closing_balance: 6,
    });
  });

  it('DY-44: the same values as stored is 200, changed false, the current token, nothing written', async () => {
    const s = await ledgerScene(ctx);
    const before = await snapshot(s);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 0)],
      before.token,
    );
    expect(r.status, text(r)).toBe(200);
    expect(r.body).toMatchObject({ success: true, changed: false });
    expect(r.body.dairyTraysUpdatedAt).toBe(before.token);
    expect(await snapshot(s)).toEqual(before);
  });

  it('DY-151: a stale token with a payload that would change nothing is still 409', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 0)],
      '2000-01-01T00:00:00.000Z',
    );
    expect(r.status).toBe(409);
    expect(text(r)).toContain(STALE_DT);
  });

  it('DY-45: a second save with the token from the first response succeeds without a reload', async () => {
    const s = await ledgerScene(ctx);
    const first = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 2)],
      (await s.token())!,
    );
    const second = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 5)],
      first.body.dairyTraysUpdatedAt,
    );
    expect(second.status, text(second)).toBe(200);
    expect(await returnedOf(s)).toBe(5);
    expect(second.body.dairyTraysUpdatedAt).toBe(await s.token());
  });

  it('DY-46: ledger lines not in the request keep their stored returns', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 8);
    await rebuildLedger(ctx, s.paperId);

    let r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 2)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    r = await dt.save(
      s.paperId,
      [re(v2, s.trayTypeId, 3)],
      r.body.dairyTraysUpdatedAt,
    );
    expect(r.status, text(r)).toBe(200);
    expect(await returnedOf(s, s.v)).toBe(2);
    expect(await returnedOf(s, v2)).toBe(3);
  });

  it('DY-47: a return set back to 0 is stored as 0, never null', async () => {
    const s = await ledgerScene(ctx);
    let r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 5)],
      (await s.token())!,
    );
    r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 0)],
      r.body.dairyTraysUpdatedAt,
    );
    expect(r.status, text(r)).toBe(200);
    expect(await returnedOf(s)).toBe(0);
  });

  it('DY-48: one bad entry among many fails the whole request; ledger and token unchanged', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 8);
    await rebuildLedger(ctx, s.paperId);
    const before = await snapshot(s);

    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 2), re(v2, s.trayTypeId, 9)],
      before.token,
    );
    expect(r.status, text(r)).toBe(400);
    expect(await snapshot(s)).toEqual(before);
  });
});

describe('DY-49, DY-50, DY-154 cells that do not exist', () => {
  it('DY-49: an entry for a vehicle + session with no row, or a tray type that is not a column, is 400 with the row-not-found detail', async () => {
    const s = await ledgerScene(ctx);
    const stranger = await addVehicle(ctx);
    const token = (await s.token())!;

    let r = await dt.save(s.paperId, [re(stranger, s.trayTypeId, 0)], token);
    expect(r.status, text(r)).toBe(400);
    expect(r.body.message).toBe(DT_RETURNS_REJECTED);
    expect(r.body.details).toContain(
      `Dairy tray row not found for vehicle ${stranger.id} (NIGHT)`,
    );

    // the vehicle has a NIGHT row only
    r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 0, 'MORNING')], token);
    expect(r.status).toBe(400);
    expect(r.body.details).toContain(
      `Dairy tray row not found for vehicle ${s.v.id} (MORNING)`,
    );

    // an inactive tray type without a line is not a column
    const b2 = await ctx.world.addBrand({ tray: true });
    await setTrayActive(ctx, b2.trayTypeId!, false);
    r = await dt.save(s.paperId, [re(s.v, b2.trayTypeId!, 0)], token);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe(DT_RETURNS_REJECTED);
  });

  it('DY-154: an unknown cell and a return above the balance give one 400 with both messages in details[]', async () => {
    const s = await ledgerScene(ctx);
    const stranger = await addVehicle(ctx);
    const r = await dt.save(
      s.paperId,
      [re(stranger, s.trayTypeId, 1), re(s.v, s.trayTypeId, 11)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(400);
    expect(r.body.message).toBe(DT_RETURNS_REJECTED);
    expect(r.body.details).toHaveLength(2);
    expect(text(r)).toContain(
      `Dairy tray row not found for vehicle ${stranger.id}`,
    );
    expect(text(r)).toContain('exceeds the outstanding balance of 10');
  });

  it('DY-50: a cell inside an existing row with no ledger line: returned 0 is 200 and stores nothing; returned above 0 is 400 (available 0)', async () => {
    const s = await ledgerScene(ctx);
    const b2 = await ctx.world.addBrand({ tray: true });
    const before = await snapshot(s);

    let r = await dt.save(
      s.paperId,
      [re(s.v, b2.trayTypeId!, 0)],
      before.token,
    );
    expect(r.status, text(r)).toBe(200);
    expect(await snapshot(s)).toEqual(before);

    r = await dt.save(s.paperId, [re(s.v, b2.trayTypeId!, 1)], before.token);
    expect(r.status, text(r)).toBe(400);
    expect(text(r)).toContain('exceeds the outstanding balance of 0');
    expect(await snapshot(s)).toEqual(before);
  });
});

describe('DY-60 to DY-64 balance and limit', () => {
  it('DY-60: returned within opening + taken is accepted; closing = opening + taken - returned', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 10)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    expect(
      (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!.closing_balance,
    ).toBe(0);
  });

  it('DY-61: returns above opening + taken are 400 "returns were rejected" and every offender is listed with names and numbers', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 4);
    await rebuildLedger(ctx, s.paperId);
    const before = await snapshot(s);

    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 11), re(v2, s.trayTypeId, 5)],
      before.token,
    );
    expect(r.status, text(r)).toBe(400);
    expect(r.body.message).toBe(DT_RETURNS_REJECTED);
    expect(r.body.details).toHaveLength(2);
    const joined = (r.body.details as string[]).join('\n');
    expect(joined).toContain(vname(s.v));
    expect(joined).toContain(vname(v2));
    expect(joined).toContain('11');
    expect(joined).toContain('exceeds the outstanding balance of 10');
    expect(joined).toContain('exceeds the outstanding balance of 4');
    expect(await snapshot(s)).toEqual(before);
  });

  it("DY-62: more than today's purchase but within carried opening + taken is accepted", async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const later = await dtPaper(ctx, 1);
    await buyTrays(ctx, later, a.v, a.p, a.dist, 2);
    await rebuildLedger(ctx, later.paperId);
    const r = await dt.save(
      later.paperId,
      [re(a.v, a.trayTypeId, 12)],
      await dtToken(ctx, later.paperId),
    );
    expect(r.status, text(r)).toBe(200);
    expect(
      (await dtRow(ctx, later.paperId, a.v, a.trayTypeId))!.closing_balance,
    ).toBe(0);
  });

  it('DY-63: a row total of 2000 is accepted when the balance covers it; 2001 is 400 and nothing is saved', async () => {
    const s = await ledgerScene(ctx, { qty: 2001 });
    const token = (await s.token())!;
    const over = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2001)], token);
    expect(over.status, text(over)).toBe(400);
    expect(await s.token()).toBe(token);

    const ok = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2000)], token);
    expect(ok.status, text(ok)).toBe(200);
    expect(await returnedOf(s)).toBe(2000);
  });

  it('DY-64: saving 1500 and then 1500 again sets the row total to 1500, it does not add', async () => {
    const s = await ledgerScene(ctx, { qty: 3000 });
    let r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 1500)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 1500)],
      r.body.dairyTraysUpdatedAt,
    );
    expect(r.status, text(r)).toBe(200);
    expect(await returnedOf(s)).toBe(1500);
  });
});

describe('DY-65, DY-102 inactive vehicle or tray type', () => {
  it('DY-65 a: inactive vehicle: echoing the stored value is accepted unchanged; a different value is 400 read-only', async () => {
    const s = await ledgerScene(ctx);
    const first = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 2)],
      (await s.token())!,
    );
    await setVehicleActive(ctx, s.v, false);
    const token = first.body.dairyTraysUpdatedAt as string;

    const echo = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2)], token);
    expect(echo.status, text(echo)).toBe(200);
    expect(echo.body.changed).toBe(false);

    const change = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 3)], token);
    expect(change.status, text(change)).toBe(400);
    expect(text(change)).toContain('inactive');
    expect(text(change)).toContain('read-only');
    expect(await returnedOf(s)).toBe(2);
  });

  it('DY-65 b / DY-102: inactive tray type with a ledger line: echo accepted, change is 400 read-only', async () => {
    const s = await ledgerScene(ctx);
    const first = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 2)],
      (await s.token())!,
    );
    await setTrayActive(ctx, s.trayTypeId, false);
    const token = first.body.dairyTraysUpdatedAt as string;

    expect(
      (await dt.save(s.paperId, [re(s.v, s.trayTypeId, 2)], token)).status,
    ).toBe(200);
    const change = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 1)], token);
    expect(change.status, text(change)).toBe(400);
    expect(text(change)).toContain('read-only');
  });
});

describe('DY-66 to DY-69 ledger effects of a save', () => {
  it('DY-66: a NIGHT return does not change the MORNING line of the same vehicle and tray type', async () => {
    const s = await ledgerScene(ctx);
    await buyTrays(ctx, s.sheet, s.v, s.p, s.dist, 6, { session: 'MORNING' });
    await rebuildLedger(ctx, s.paperId);
    const morningBefore = await dtRow(
      ctx,
      s.paperId,
      s.v,
      s.trayTypeId,
      'MORNING',
    );

    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 4, 'NIGHT')],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    const morningAfter = await dtRow(
      ctx,
      s.paperId,
      s.v,
      s.trayTypeId,
      'MORNING',
    );
    expect(morningAfter).toMatchObject({
      opening_balance: morningBefore!.opening_balance,
      trays_taken: morningBefore!.trays_taken,
      trays_returned: morningBefore!.trays_returned,
      closing_balance: morningBefore!.closing_balance,
    });
  });

  it('DY-67: another stored return above its balance (legacy) makes any save 409 with details, until corrected in the same request', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 10);
    await rebuildLedger(ctx, s.paperId);
    await setStoredReturn(ctx, s.paperId, v2, s.trayTypeId, 15); // legacy: above its balance of 10
    const token = (await s.token())!;

    const blocked = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 1)], token);
    expect(blocked.status, text(blocked)).toBe(409);
    expect(blocked.body.message).toBe(DT_DISCREPANCY);
    expect(blocked.body.details.join('\n')).toContain(vname(v2));
    expect(await returnedOf(s, s.v)).toBe(0);

    const fixed = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 1), re(v2, s.trayTypeId, 10)],
      token,
    );
    expect(fixed.status, text(fixed)).toBe(200);
    expect(await returnedOf(s, v2)).toBe(10);
  });

  it('DY-68 a: a line that no longer qualifies (opening 0, taken 0, return 0) is deleted by the save', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 8);
    await rebuildLedger(ctx, s.paperId);
    // the purchase of the first vehicle disappears after the ledger was stored
    await ctx.db.purchase_entry.deleteMany({ where: { vehicle_id: s.v.id } });

    const r = await dt.save(
      s.paperId,
      [re(v2, s.trayTypeId, 1)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    expect(await dtRow(ctx, s.paperId, s.v, s.trayTypeId)).toBeNull();
    expect(await dtRow(ctx, s.paperId, v2, s.trayTypeId)).not.toBeNull();
  });

  it('DY-68 b: a line holding a positive return is never deleted; the change is refused (409) instead', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 8);
    await rebuildLedger(ctx, s.paperId);
    await setStoredReturn(ctx, s.paperId, s.v, s.trayTypeId, 3);
    await ctx.db.purchase_entry.deleteMany({ where: { vehicle_id: s.v.id } });

    const r = await dt.save(
      s.paperId,
      [re(v2, s.trayTypeId, 1)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(409);
    expect(await returnedOf(s, s.v)).toBe(3);
  });

  it('DY-69: lowering a return raises the closing; later papers are not touched on a NIGHT_SUBMITTED paper', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    let r = await dt.save(
      a.paperId,
      [re(a.v, a.trayTypeId, 6)],
      (await a.token())!,
    );
    expect(r.status, text(r)).toBe(200);

    const later = await dtPaper(ctx, 1);
    await buyTrays(ctx, later, a.v, a.p, a.dist, 5);
    await rebuildLedger(ctx, later.paperId);
    const laterBefore = await dtRow(ctx, later.paperId, a.v, a.trayTypeId);
    expect(laterBefore!.opening_balance).toBe(4);

    r = await dt.save(
      a.paperId,
      [re(a.v, a.trayTypeId, 2)],
      r.body.dairyTraysUpdatedAt,
    );
    expect(r.status, text(r)).toBe(200);
    expect(
      (await dtRow(ctx, a.paperId, a.v, a.trayTypeId))!.closing_balance,
    ).toBe(8);
    expect(
      (await dtRow(ctx, later.paperId, a.v, a.trayTypeId))!.opening_balance,
    ).toBe(4);
    expect(await forwardJobs(ctx, a.paperId)).toHaveLength(0);
  });
});

describe('DY-150 to DY-153 no-op detection (DT-5.13)', () => {
  it('DY-150: on a REOPENED paper, the same returns as stored: 200, changed false, current token, no outbox row', async () => {
    const s = await ledgerScene(ctx, { status: 'REOPENED' });
    const before = await snapshot(s);
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 0)],
      before.token,
    );
    expect(r.status, text(r)).toBe(200);
    expect(r.body).toMatchObject({ changed: false });
    expect(r.body.dairyTraysUpdatedAt).toBe(before.token);
    expect(await snapshot(s)).toEqual(before);
    expect(await forwardJobs(ctx, s.paperId)).toHaveLength(0);
  });

  it('DY-153: same returns but a stored taken that is out of date: changed true and the stored ledger is refreshed', async () => {
    const s = await ledgerScene(ctx);
    const row = (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!;
    await ctx.db.dairy_tray_transaction.update({
      where: { id: row.id },
      data: { trays_taken: 999, closing_balance: 999 },
    });
    const old = (await s.token())!;
    const r = await dt.save(s.paperId, [re(s.v, s.trayTypeId, 0)], old);
    expect(r.status, text(r)).toBe(200);
    expect(r.body.changed).toBe(true);
    expect(await dtRow(ctx, s.paperId, s.v, s.trayTypeId)).toMatchObject({
      trays_taken: 10,
      closing_balance: 10,
    });
    expect(await s.token()).not.toBe(old);
  });
});
