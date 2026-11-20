/**
 * Dairy Trays: the live ledger grid (GET). Scenarios DY-20 to DY-34 and DY-155
 * (behavioral spec sections C2, F4, F5).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import {
  addVehicle,
  buyTrays,
  cleanupDtTests,
  dairyRows,
  dtApi,
  dtHeader,
  dtPaper,
  dtRow,
  dtToken,
  leafColumns,
  ledgerScene,
  rebuildLedger,
  rowOf,
  seedDairyLine,
  setStoredReturn,
  setTrayActive,
  setVehicleActive,
  trayCell,
  trayProduct,
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

/** Saves a return through the real API (token read from the DB). */
async function saveReturn(
  paperId: number,
  v: { id: number },
  trayTypeId: number,
  returned: number,
  session = 'NIGHT',
) {
  const r = await dt.save(
    paperId,
    [{ vehicleId: v.id, trayTypeId, deliverySession: session, returned }],
    await dtToken(ctx, paperId),
  );
  expect(r.status, text(r)).toBe(200);
}

describe('DY-20 to DY-22 empty paper, no header, no side effects', () => {
  it('DY-20: header exists, no ledger lines: empty rows, totals for both sessions, a token', async () => {
    const sheet = await dtPaper(ctx, 0);
    const r = await dt.get(sheet.paperId);
    expect(r.status, text(r)).toBe(200);
    expect(Array.isArray(r.body.columns)).toBe(true);
    expect(r.body.rows).toEqual([]);
    expect(r.body.sessionTotals.NIGHT.totalVehicles).toBe(0);
    expect(r.body.sessionTotals.MORNING.totalVehicles).toBe(0);
    expect(typeof r.body.dairyTraysUpdatedAt).toBe('string');
    expect(r.body.dairyTraysUpdatedAt).toBe(await dtToken(ctx, sheet.paperId));
  });

  it('DY-21: no header: 200, token null, ledger still calculated live, header NOT created', async () => {
    const sheet = await dtPaper(ctx, 0, 'NIGHT_SUBMITTED', { header: false });
    const tp = await trayProduct(ctx);
    const v = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v, tp.p, tp.dist, 7);

    const r = await dt.get(sheet.paperId);
    expect(r.status, text(r)).toBe(200);
    expect(r.body.dairyTraysUpdatedAt).toBeNull();
    expect(trayCell(rowOf(r.body, v.id), tp.trayTypeId)).toEqual({
      opening: 0,
      trays: 7,
      returned: 0,
      closing: 7,
    });
    expect(await dtHeader(ctx, sheet.paperId)).toBeNull();
    expect(await dairyRows(ctx, sheet.paperId)).toEqual([]);
  });

  it('DY-22: repeated GETs write nothing, keep the token and give identical answers', async () => {
    const s = await ledgerScene(ctx);
    const tokenBefore = await s.token();
    const rowsBefore = JSON.stringify(await dairyRows(ctx, s.paperId));
    const a = await dt.get(s.paperId);
    const b = await dt.get(s.paperId);
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(await s.token()).toBe(tokenBefore);
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(rowsBefore);
  });
});

describe('DY-23 to DY-24 columns', () => {
  it('DY-23 a: pinned Vehicle column, brand group, colour group, four sub-columns; only Returned is editable', async () => {
    const s = await ledgerScene(ctx);
    const r = await dt.get(s.paperId);
    const brand = await ctx.db.master_brand.findUniqueOrThrow({
      where: { id: ctx.world.brandTray.id },
    });
    const tray = await ctx.db.master_tray_type.findUniqueOrThrow({
      where: { id: s.trayTypeId },
    });

    expect(r.body.columns[0]).toMatchObject({
      headerName: 'Vehicle',
      field: 'vehicleName',
      pinned: 'left',
    });
    const group = r.body.columns.find(
      (c: any) => c.headerName === `${brand.name} Tray`,
    );
    expect(group).toBeDefined();
    const colour = group.children.find(
      (c: any) => c.headerName === `${tray.color} Tray`,
    );
    expect(colour).toBeDefined();
    expect(
      colour.children.map((c: any) => [c.headerName, c.field, c.editable]),
    ).toEqual([
      ['Opening', `tray_${s.trayTypeId}_opening`, false],
      ['Trays', `tray_${s.trayTypeId}`, false],
      ['Returned', `tray_${s.trayTypeId}_returned`, true],
      ['Closing', `tray_${s.trayTypeId}_closing`, false],
    ]);
  });

  it('DY-23 b: brand groups are ordered by brand name', async () => {
    const s = await ledgerScene(ctx);
    const b2 = await ctx.world.addBrand({ tray: true });
    const r = await dt.get(s.paperId);
    const names = (
      await ctx.db.master_brand.findMany({
        where: { id: { in: [ctx.world.brandTray.id, b2.id] } },
      })
    ).map((b) => `${b.name} Tray`);
    const order = (r.body.columns as any[])
      .map((c) => c.headerName as string)
      .filter((h) => names.includes(h));
    expect(order).toEqual([...names].sort());
  });

  it('DY-24 a: an inactive tray type with no ledger line has no column', async () => {
    const s = await ledgerScene(ctx);
    const b2 = await ctx.world.addBrand({ tray: true });
    await setTrayActive(ctx, b2.trayTypeId!, false);
    const r = await dt.get(s.paperId);
    const fields = leafColumns(r.body.columns).map((c) => c.field);
    expect(fields).not.toContain(`tray_${b2.trayTypeId}_returned`);
    expect(fields).toContain(`tray_${s.trayTypeId}_returned`);
  });

  it('DY-24 b: an inactive tray type with a ledger line keeps its column, Returned read-only', async () => {
    const sheet = await dtPaper(ctx, 0);
    const b2 = await ctx.world.addBrand({ tray: true });
    const p2 = await ctx.world.addProduct({ brand: b2, tray: true });
    const v = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v, p2, ctx.world.distA, 5, {
      trayTypeId: b2.trayTypeId,
    });
    await rebuildLedger(ctx, sheet.paperId);
    await setTrayActive(ctx, b2.trayTypeId!, false);

    const r = await dt.get(sheet.paperId);
    const returned = leafColumns(r.body.columns).find(
      (c) => c.field === `tray_${b2.trayTypeId}_returned`,
    );
    expect(returned).toMatchObject({ editable: false });
  });
});

describe('DY-25 to DY-28 rows', () => {
  it('DY-25 and DY-155: rows sort by vehicle name (nameless last, then id), NIGHT before MORNING; nameless shows its number', async () => {
    const sheet = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const nameless = await addVehicle(ctx, { name: null });
    const vB = await addVehicle(ctx, { name: `B-${ctx.world.sfx}` });
    const vA = await addVehicle(ctx, { name: `A-${ctx.world.sfx}` });
    for (const v of [nameless, vB, vA])
      await buyTrays(ctx, sheet, v, tp.p, tp.dist, 3, { session: 'NIGHT' });
    await buyTrays(ctx, sheet, vB, tp.p, tp.dist, 2, { session: 'MORNING' });
    await rebuildLedger(ctx, sheet.paperId);

    const r = await dt.get(sheet.paperId);
    expect(
      r.body.rows.map((x: any) => [x.vehicleId, x.deliverySession]),
    ).toEqual([
      [vA.id, 'NIGHT'],
      [vB.id, 'NIGHT'],
      [vB.id, 'MORNING'],
      [nameless.id, 'NIGHT'],
    ]);
    expect(rowOf(r.body, nameless.id)!.vehicleName).toBe(nameless.number);
  });

  it('DY-26: a vehicle with only a carried opening and no purchase gets a row; nothing is stored for the paper', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const later = await dtPaper(ctx, 1);
    const r = await dt.get(later.paperId);
    expect(trayCell(rowOf(r.body, a.v.id), a.trayTypeId)).toEqual({
      opening: 10,
      trays: 0,
      returned: 0,
      closing: 10,
    });
    expect(await dairyRows(ctx, later.paperId)).toEqual([]);
  });

  it('DY-27: a vehicle with no balance and no purchase is not shown (also after a full return)', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const idle = await addVehicle(ctx);
    await saveReturn(a.paperId, a.v, a.trayTypeId, 10);
    const later = await dtPaper(ctx, 1);
    const r = await dt.get(later.paperId);
    expect(rowOf(r.body, a.v.id, 'NIGHT')).toBeNull();
    expect(rowOf(r.body, a.v.id, 'MORNING')).toBeNull();
    expect(rowOf(r.body, idle.id)).toBeNull();
  });

  it('DY-28: an inactive vehicle with a balance is shown with readOnly true', async () => {
    const s = await ledgerScene(ctx);
    await setVehicleActive(ctx, s.v, false);
    const r = await dt.get(s.paperId);
    expect(rowOf(r.body, s.v.id)).toMatchObject({ readOnly: true });
  });
});

describe('DY-29 to DY-31 values and totals', () => {
  it('DY-29: opening = latest earlier stored closing, trays from purchases, returned stored, closing derived; stored opening/taken/closing are not read back', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const later = await dtPaper(ctx, 1);
    await buyTrays(ctx, later, a.v, a.p, a.dist, 4);
    await rebuildLedger(ctx, later.paperId);
    await setStoredReturn(ctx, later.paperId, a.v, a.trayTypeId, 3);

    const row = (await dtRow(ctx, later.paperId, a.v, a.trayTypeId))!;
    await ctx.db.dairy_tray_transaction.update({
      where: { id: row.id },
      data: { opening_balance: 999, trays_taken: 999, closing_balance: 999 },
    });

    const r = await dt.get(later.paperId);
    expect(trayCell(rowOf(r.body, a.v.id), a.trayTypeId)).toEqual({
      opening: 10,
      trays: 4,
      returned: 3,
      closing: 11,
    });
  });

  it('DY-30: a stored positive return on a line with no activity (legacy) stays visible', async () => {
    const sheet = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const v = await addVehicle(ctx);
    await seedDairyLine(ctx, sheet.paperId, v, tp.trayTypeId, {
      opening: 0,
      taken: 0,
      returned: 5,
    });
    const r = await dt.get(sheet.paperId);
    expect(r.status, text(r)).toBe(200);
    expect(trayCell(rowOf(r.body, v.id), tp.trayTypeId).returned).toBe(5);
  });

  it('DY-31: sessionTotals per session with distinct vehicle count and per tray sums; no combined totals', async () => {
    const sheet = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const v1 = await addVehicle(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v1, tp.p, tp.dist, 10);
    await buyTrays(ctx, sheet, v2, tp.p, tp.dist, 6);
    await rebuildLedger(ctx, sheet.paperId);
    await saveReturn(sheet.paperId, v1, tp.trayTypeId, 4);

    const r = await dt.get(sheet.paperId);
    const night = r.body.sessionTotals.NIGHT;
    expect(night.totalVehicles).toBeGreaterThanOrEqual(2);
    expect(night[`tray_${tp.trayTypeId}`]).toEqual({
      opening: 0,
      trays: 16,
      returned: 4,
      closing: 12,
    });
    expect(r.body.sessionTotals.MORNING.totalVehicles).toBe(0);
    expect(r.body).not.toHaveProperty('totals');
    expect(r.body.sessionTotals).not.toHaveProperty('totals');
  });
});

describe('DY-32 and DY-33 workflow', () => {
  it.each([
    ['DRAFT', false],
    ['NIGHT_SUBMITTED', true],
    ['MORNING_SUBMITTED', false],
    ['FINALIZED', false],
    ['REOPENED', true],
  ])(
    'DY-32 / DY-33: GET in %s is 200 and workflow.editable is %s',
    async (status, editable) => {
      const s = await ledgerScene(ctx, { status });
      const r = await dt.get(s.paperId);
      expect(r.status, text(r)).toBe(200);
      expect(r.body.workflow).toMatchObject({ status, editable });
    },
  );
});

describe('DY-34 rounding of taken', () => {
  it('DY-34: three 0.4 purchases of one vehicle, session and tray type give 1; one 10.5 gives 11 (rounded once, half-up)', async () => {
    const sheet = await dtPaper(ctx, 0);
    const trayTypeId = ctx.world.brandTray.trayTypeId!;
    const dist = ctx.world.distA;
    const vSmall = await addVehicle(ctx);
    const vHalf = await addVehicle(ctx);
    for (let i = 0; i < 3; i++) {
      const p = await ctx.world.addProduct({ tray: true });
      await buyTrays(ctx, sheet, vSmall, p, dist, 0.4);
    }
    const p4 = await ctx.world.addProduct({ tray: true });
    await buyTrays(ctx, sheet, vHalf, p4, dist, 10.5);

    const r = await dt.get(sheet.paperId);
    expect(trayCell(rowOf(r.body, vSmall.id), trayTypeId).trays).toBe(1);
    expect(trayCell(rowOf(r.body, vHalf.id), trayTypeId).trays).toBe(11);
  });
});
