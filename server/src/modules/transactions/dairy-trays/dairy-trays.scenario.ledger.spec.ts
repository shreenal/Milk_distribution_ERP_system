/**
 * Dairy Trays: ledger calculation as seen through the live grid. Scenarios DY-70 to DY-78
 * (behavioral spec section C5). Earlier stored ledgers are created with the helper seams.
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
  dtPaper,
  dtRow,
  ledgerScene,
  rebuildLedger,
  rowOf,
  seedDairyLine,
  trayCell,
  trayProduct,
} from '../../../../test/helper/dairy-trays-helpers.js';

const text = (r: { body: unknown }) => JSON.stringify(r.body);

let ctx: OrdersCtx;
let dt: ReturnType<typeof dtApi>;
const extraCleanup: (() => Promise<unknown>)[] = [];
beforeAll(async () => {
  ctx = await createOrdersTestContext({ modules: [DairyTraysModule] });
  dt = dtApi(ctx);
});
afterAll(() => ctx.close());
afterEach(async () => {
  await cleanupDtTests(ctx);
  for (const fn of extraCleanup.splice(0).reverse()) await fn();
});

const cellAt = async (
  paperId: number,
  vehicleId: number,
  trayTypeId: number,
  session = 'NIGHT',
) => {
  const r = await dt.get(paperId);
  expect(r.status, text(r)).toBe(200);
  const row = rowOf(r.body, vehicleId, session);
  return row ? trayCell(row, trayTypeId) : null;
};

describe('DY-70 to DY-72 opening balance', () => {
  it('DY-70 a: opening is the latest EARLIER stored closing, even across a gap', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const far = await dtPaper(ctx, 5);
    expect(await cellAt(far.paperId, a.v.id, a.trayTypeId)).toMatchObject({
      opening: 10,
      closing: 10,
    });
  });

  it('DY-70 b: a latest earlier closing of 0 gives opening 0 (an older non-zero closing does not resurface)', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const mid = await dtPaper(ctx, 1);
    await seedDairyLine(ctx, mid.paperId, a.v, a.trayTypeId, {
      opening: 10,
      taken: 0,
      returned: 10,
    });
    const last = await dtPaper(ctx, 2);
    expect(await cellAt(last.paperId, a.v.id, a.trayTypeId)).toBeNull();
  });

  it('DY-71: an earlier paper that is DRAFT or NIGHT_SUBMITTED (not finalized) still counts', async () => {
    for (const status of ['DRAFT', 'NIGHT_SUBMITTED']) {
      const a = await ledgerScene(ctx, {
        k: status === 'DRAFT' ? 0 : 10,
        qty: 6,
        status,
      });
      const later = await dtPaper(ctx, status === 'DRAFT' ? 1 : 11);
      expect(await cellAt(later.paperId, a.v.id, a.trayTypeId)).toMatchObject({
        opening: 6,
      });
    }
  });

  it('DY-72: NIGHT closing does not flow into MORNING of the same day; each session reads only its own earlier ledger', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10, session: 'NIGHT' });
    const later = await dtPaper(ctx, 1);
    await buyTrays(ctx, later, a.v, a.p, a.dist, 3, { session: 'MORNING' });
    await rebuildLedger(ctx, later.paperId);

    expect(await cellAt(a.paperId, a.v.id, a.trayTypeId, 'MORNING')).toBeNull();
    expect(
      await cellAt(later.paperId, a.v.id, a.trayTypeId, 'NIGHT'),
    ).toMatchObject({
      opening: 10,
    });
    expect(
      await cellAt(later.paperId, a.v.id, a.trayTypeId, 'MORNING'),
    ).toMatchObject({
      opening: 0,
      trays: 3,
      closing: 3,
    });
  });
});

describe('DY-73 to DY-76 taken and tray type resolution', () => {
  it('DY-73: a purchase with no tray type and no matching active rule gives no trays and no ledger line', async () => {
    const sheet = await dtPaper(ctx, 0);
    const plain = await ctx.world.addProduct({}); // brandPlain has no tray rule
    const v = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v, plain, ctx.world.distA, 9, {
      trayTypeId: null,
    });
    await rebuildLedger(ctx, sheet.paperId);

    const r = await dt.get(sheet.paperId);
    expect(rowOf(r.body, v.id)).toBeNull();
    expect(await dairyRows(ctx, sheet.paperId)).toEqual([]);
  });

  it('DY-74: a frozen tray type on the purchase entry is used even after the tray rules change', async () => {
    const sheet = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const v = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v, tp.p, tp.dist, 7);
    await ctx.db.product_tray_rule.updateMany({
      where: { brand_id: ctx.world.brandTray.id },
      data: { is_active: false },
    });
    expect(await cellAt(sheet.paperId, v.id, tp.trayTypeId)).toMatchObject({
      trays: 7,
    });
  });

  it('DY-75: without a frozen type the most specific active rule wins, the lowest rule id breaks a tie, inactive rules are ignored', async () => {
    const b = await ctx.world.addBrand({ tray: true }); // rule 1: brand only -> tray T1
    const product = await ctx.world.addProduct({ brand: b, tray: true });
    const t1 = b.trayTypeId!;
    const mkTray = async (color: string) => {
      const t = await ctx.db.master_tray_type.create({
        data: { brand_id: b.id, color: `${color}${ctx.world.sfx}` },
      });
      extraCleanup.push(() =>
        ctx.db.master_tray_type.deleteMany({ where: { id: t.id } }),
      );
      return t.id;
    };
    const mkRule = async (trayTypeId: number) => {
      const r = await ctx.db.product_tray_rule.create({
        data: {
          brand_id: b.id,
          product_group_id: ctx.world.milkGroup.id,
          tray_type_id: trayTypeId,
          applies_to_packaging: false,
        },
      });
      extraCleanup.push(() =>
        ctx.db.product_tray_rule.deleteMany({ where: { id: r.id } }),
      );
      return r;
    };
    const t2 = await mkTray('B');
    const t3 = await mkTray('C');
    const rule2 = await mkRule(t2); // brand + group: more specific than rule 1
    await mkRule(t3); // same specificity as rule 2, higher id

    const sheet = await dtPaper(ctx, 0);
    const v = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v, product, ctx.world.distA, 4, {
      trayTypeId: null,
    });

    // most specific wins; lowest id on a tie
    let cells = await Promise.all(
      [t1, t2, t3].map((t) => cellAt(sheet.paperId, v.id, t)),
    );
    expect(cells[1]).toMatchObject({ trays: 4 });
    expect(cells[0]?.trays ?? 0).toBe(0);
    expect(cells[2]?.trays ?? 0).toBe(0);

    // inactive rules are ignored: the next rule of the same specificity takes over
    await ctx.db.product_tray_rule.update({
      where: { id: rule2.id },
      data: { is_active: false },
    });
    cells = await Promise.all(
      [t1, t2, t3].map((t) => cellAt(sheet.paperId, v.id, t)),
    );
    expect(cells[2]).toMatchObject({ trays: 4 });
    expect(cells[1]?.trays ?? 0).toBe(0);
  });

  it('DY-76: a purchase of 0 with opening 0 is a calculation key only; no row is stored or shown', async () => {
    const sheet = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const v = await addVehicle(ctx);
    await buyTrays(ctx, sheet, v, tp.p, tp.dist, 0);
    await rebuildLedger(ctx, sheet.paperId);
    expect(await dairyRows(ctx, sheet.paperId)).toEqual([]);
    expect(rowOf((await dt.get(sheet.paperId)).body, v.id)).toBeNull();
  });
});

describe('DY-77 and DY-78 backfill and legacy data', () => {
  it("DY-77: a backfilled earlier paper has a correct own grid; a later paper's stored opening stays stale until a cascade", async () => {
    const later = await ledgerScene(ctx, { k: 1, qty: 5 });
    const earlier = await dtPaper(ctx, 0);
    // the purchase makes the live grid row; the stored line is written without a cascade
    await buyTrays(ctx, earlier, later.v, later.p, later.dist, 10);
    await seedDairyLine(ctx, earlier.paperId, later.v, later.trayTypeId, {
      opening: 0,
      taken: 10,
      returned: 0,
    });

    expect(
      await cellAt(earlier.paperId, later.v.id, later.trayTypeId),
    ).toMatchObject({
      opening: 0,
      trays: 10,
      closing: 10,
    });
    // live opening is right, stored opening is stale
    expect(
      await cellAt(later.paperId, later.v.id, later.trayTypeId),
    ).toMatchObject({
      opening: 10,
      closing: 15,
    });
    expect(
      (await dtRow(ctx, later.paperId, later.v, later.trayTypeId))!
        .opening_balance,
    ).toBe(0);

    await rebuildLedger(ctx, earlier.paperId);
    expect(
      (await dtRow(ctx, later.paperId, later.v, later.trayTypeId))!
        .opening_balance,
    ).toBe(10);
  });

  it('DY-78: a legacy negative stored closing carries as a non-zero opening and the row stays visible', async () => {
    const a = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const v = await addVehicle(ctx);
    await seedDairyLine(ctx, a.paperId, v, tp.trayTypeId, {
      opening: 0,
      taken: 0,
      returned: 5,
    });
    const later = await dtPaper(ctx, 1);
    expect(await cellAt(later.paperId, v.id, tp.trayTypeId)).toMatchObject({
      opening: -5,
      closing: -5,
    });
  });
});
