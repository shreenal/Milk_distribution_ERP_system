/**
 * Orders – morning save.
 * Scenarios: S-80 .. S-97, S-142, S-143
 * (spec: OD-7.x, OD-9.6, OD-12.8, CT-6.5, CT-6.6, CT-10.2)
 */
import { Logger } from '@nestjs/common';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { OrdersRepository } from './orders.repository.js';
import {
  createOrdersTestContext,
  m,
  n,
  num,
  type OrdersCtx,
  type ProductOpts,
} from '../../../../test/helper/orders-harness.js';

describe('Orders morning save', () => {
  let ctx: OrdersCtx;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.world.deletePapers();
  });

  const body = (r: { body: any }) => JSON.stringify(r.body);

  /** Night-saved (qty each) and NIGHT_SUBMITTED. Rate 56/L, 12 L per crate → 672 per crate. */
  async function submitted(
    o: { products?: ProductOpts[]; clients?: number; qty?: number } = {},
  ) {
    const s = await ctx.world.scene({
      products: o.products ?? [{}],
      clients: o.clients ?? 1,
    });
    const entries = s.clients.flatMap((c) =>
      s.products.map((p) => n(c, p, o.qty ?? 10)),
    );
    await ctx.seedNight(s.sheet, entries);
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    return s;
  }
  const flagOf = async (sheetId: number) =>
    (await ctx.sheetRow(sheetId)).order_morning_entry_saved_at;

  it('S-80 existing line, delivered 12 vs ordered 10: accepted, final bill, flag, tray recalc, token', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted({ products: [{ tray: true }] });
    const before = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.morning(sheet.sheetId, [m(c, p, 12)], before);
    expect(res.status, body(res)).toBe(200);
    expect(res.body.message).toBe('Morning entries saved successfully');
    expect(res.body.itemsUpdatedAt).not.toBe(before);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.delivered_qty)).toBe(12);
    expect(num(l.final_selling_rate)).toBe(56);
    expect(num(l.final_gst_percentage)).toBe(0);
    expect(num(l.final_taxable_amount)).toBe(8064);
    expect(num(l.final_gst_amount)).toBe(0);
    expect(num(l.final_bill_amount)).toBe(8064);
    expect(l.final_gst_inclusive).toBe(false);
    expect(await flagOf(sheet.sheetId)).not.toBeNull();
    expect((await ctx.trayRows(sheet.sheetId))[0].trays_taken).toBe(12);
  });

  it('S-81 delivered > 150% of ordered is accepted; warning logged once per changed value (log only, OD-7.5)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const over = () =>
      warn.mock.calls.filter((a) => String(a[0]).includes('over-delivery'))
        .length;

    await ctx.seedMorning(sheet, [m(c, p, 15)]); // exactly 150%: no warning
    expect(over()).toBe(0);
    await ctx.seedMorning(sheet, [m(c, p, 16)]);
    expect(over()).toBe(1);
    await ctx.seedMorning(sheet, [m(c, p, 16)]); // unchanged value: not logged again
    expect(over()).toBe(1);
    expect(
      num((await ctx.line(sheet.sheetId, c.id, p.id))!.delivered_qty),
    ).toBe(16);
  });

  it('S-82a existing line of a deactivated client/product: delivered correction allowed', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await ctx.db.master_client.update({
      where: { id: c.id },
      data: { is_active: false },
    });
    await ctx.db.master_product.update({
      where: { id: p.id },
      data: { is_active: false },
    });
    await ctx.seedMorning(sheet, [m(c, p, 8)]);
    expect(
      num((await ctx.line(sheet.sheetId, c.id, p.id))!.delivered_qty),
    ).toBe(8);
  });

  it('S-82b first morning save still needs a live rate → 400 "No rate configured"', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await world.deleteRates(p);
    const res = await ctx.api.morning(
      sheet.sheetId,
      [m(c, p, 8)],
      await ctx.tokenOf(sheet.sheetId),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      `No rate configured for client ${c.id} product ${p.id}`,
    );
  });

  it('S-83 NIGHT_SUBMITTED: delivered > 0 with no line creates a morning line (insert-only, frozen config)', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await world.scene({ clients: 2 });
    await ctx.seedNight(sheet, [n(c1, p, 10)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(sheet, [m(c2, p, 3)]);
    const l = (await ctx.line(sheet.sheetId, c2.id, p.id))!;
    expect(num(l.ordered_qty)).toBe(0);
    expect(l.night_selling_rate).toBeNull();
    expect(num(l.night_bill_amount)).toBe(0);
    expect(num(l.delivered_qty)).toBe(3);
    expect(num(l.final_selling_rate)).toBe(56);
    expect(num(l.final_gst_percentage)).toBe(0);
    expect(num(l.final_bill_amount)).toBe(2016);
    expect(l).toMatchObject({
      product_link_id: p.links[world.distA.id],
      units_per_order_unit: 12,
      pricing_unit: 'L',
      owner_distributor_id: world.distA.id,
      resolved_via_fallback: false,
    });
    expect(num(l.pricing_quantity)).toBe(12);
  });

  it('S-84 [race seam] unique-key collision on a morning insert → 409, rollback', async () => {
    // A concurrent writer is simulated: the line exists but this request "does not see it".
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    const t = await ctx.tokenOf(sheet.sheetId);
    vi.spyOn(
      OrdersRepository.prototype,
      'findSheetItemsByProductBatch',
    ).mockResolvedValueOnce(new Map() as never);
    const res = await ctx.api.morning(sheet.sheetId, [m(c, p, 3)], t);
    expect(res.status, body(res)).toBe(409);
    expect(res.body.message).toBe(
      'Another save changed this sheet at the same time. Please reload and retry.',
    );
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
    expect(
      (await ctx.line(sheet.sheetId, c.id, p.id))!.delivered_qty,
    ).toBeNull();
  });

  it('S-85 REOPENED: new line rejected, whole request fails (existing correction not applied)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.seedNight(sheet, [n(c1, p, 10)]);
    await ctx.setStatus(sheet, 'REOPENED');
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.morning(
      sheet.sheetId,
      [m(c1, p, 4), m(c2, p, 3)],
      t,
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      'New order lines cannot be created while the paper is REOPENED. Reopened sheets allow delivery corrections to existing lines only.',
    );
    expect(await ctx.line(sheet.sheetId, c2.id, p.id)).toBeNull();
    expect(
      (await ctx.line(sheet.sheetId, c1.id, p.id))!.delivered_qty,
    ).toBeNull();
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
  });

  it('S-86 REOPENED: explicit 0 with no line is a no-op, token unchanged', async () => {
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.seedNight(sheet, [n(c1, p, 10)]);
    await ctx.setStatus(sheet, 'REOPENED');
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.morning(sheet.sheetId, [m(c2, p, 0)], t);
    expect(res.status, body(res)).toBe(200);
    expect(res.body.itemsUpdatedAt).toBe(t);
    expect(await ctx.line(sheet.sheetId, c2.id, p.id)).toBeNull();
  });

  it('S-87 REOPENED, already billed line: original rate / GST % / inclusive flag are reused', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await ctx.seedMorning(sheet, [m(c, p, 10)]); // billed at 56, 0%
    await ctx.setStatus(sheet, 'REOPENED');
    await world.setDistRate(p.links[world.distA.id], 70);
    await ctx.db.master_product.update({
      where: { id: p.id },
      data: { gst_percentage: 12 },
    });
    await ctx.seedMorning(sheet, [m(c, p, 8)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.final_selling_rate)).toBe(56);
    expect(num(l.final_gst_percentage)).toBe(0);
    expect(l.final_gst_inclusive).toBe(false);
    expect(num(l.final_bill_amount)).toBe(5376);
  });

  it('S-88a REOPENED, line never billed: live rate and current GST', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await ctx.setStatus(sheet, 'REOPENED');
    await world.setDistRate(p.links[world.distA.id], 70);
    await ctx.db.master_product.update({
      where: { id: p.id },
      data: { gst_percentage: 18 },
    });
    await ctx.seedMorning(sheet, [m(c, p, 5)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.final_selling_rate)).toBe(70);
    expect(num(l.final_gst_percentage)).toBe(18);
    expect(num(l.final_taxable_amount)).toBe(4200);
    expect(num(l.final_gst_amount)).toBe(756);
    expect(num(l.final_bill_amount)).toBe(4956);
  });

  it('S-88b REOPENED, line previously delivered 0: live rate again', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await ctx.seedMorning(sheet, [m(c, p, 0)]);
    await ctx.setStatus(sheet, 'REOPENED');
    await world.setDistRate(p.links[world.distA.id], 70);
    await ctx.seedMorning(sheet, [m(c, p, 5)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.final_selling_rate)).toBe(70);
    expect(num(l.final_bill_amount)).toBe(4200);
  });

  it('S-89 cancelled line, delivered 0: success without any rate, final fields stay 0', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await world.scene();
    await ctx.seedNight(sheet, [n(c, p, 10)]);
    await ctx.seedNight(sheet, [n(c, p, 0)]); // cancel
    await world.deleteRates(p);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(sheet, [m(c, p, 0)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.delivered_qty)).toBe(0);
    expect(num(l.final_taxable_amount)).toBe(0);
    expect(num(l.final_gst_amount)).toBe(0);
    expect(num(l.final_bill_amount)).toBe(0);
    expect(num(l.final_selling_rate)).toBe(56);
    expect(num(l.final_gst_percentage)).toBe(0);
    expect(l.final_gst_inclusive).toBe(false);
  });

  it('S-90 cancelled line, delivered > 0: live pricing; missing rate → 400', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await world.scene();
    await ctx.seedNight(sheet, [n(c, p, 10)]);
    await ctx.seedNight(sheet, [n(c, p, 0)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await world.deleteRates(p);
    const bad = await ctx.api.morning(
      sheet.sheetId,
      [m(c, p, 3)],
      await ctx.tokenOf(sheet.sheetId),
    );
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.message)).toContain(
      `No rate configured for client ${c.id} product ${p.id}`,
    );

    await world.addDistRate(p.links[world.distA.id], 56);
    await ctx.seedMorning(sheet, [m(c, p, 3)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.final_selling_rate)).toBe(56);
    expect(num(l.final_bill_amount)).toBe(2016);
  });

  it('S-91 morning-created line already at delivered 0, no live rate, delivered set to 0 again → 400 missing rate', async () => {
    // S-91 as amended (decision: option A). Pricing is frozen only while delivered > 0 (OD-9.6 / Q2),
    // so once the line is back at delivered 0 a further save needs a live rate again.
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await world.scene({ clients: 2 });
    await ctx.seedNight(sheet, [n(c1, p, 10)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(sheet, [m(c2, p, 3)]); // morning-created
    await ctx.seedMorning(sheet, [m(c2, p, 0)]); // live rate still present here
    await world.deleteRates(p);
    const res = await ctx.api.morning(
      sheet.sheetId,
      [m(c2, p, 0)],
      await ctx.tokenOf(sheet.sheetId),
    );
    expect(res.status, body(res)).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      `No rate configured for client ${c2.id} product ${p.id}`,
    );
  });

  it('S-92 first morning save flips the grid and the tray basis from ordered to delivered', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted({ products: [{ tray: true }] });
    const grid = async () =>
      (await ctx.api.getSheet(sheet.sheetId)).body.milkGrid.rows.find(
        (r: any) => r.clientId === c.id,
      )[`product_${p.id}`];
    expect(await grid()).toBe(10);
    expect((await ctx.trayRows(sheet.sheetId))[0].trays_taken).toBe(10);
    expect(await flagOf(sheet.sheetId)).toBeNull();
    await ctx.seedMorning(sheet, [m(c, p, 4)]);
    expect(await grid()).toBe(4);
    expect((await ctx.trayRows(sheet.sheetId))[0].trays_taken).toBe(4);
    expect(await flagOf(sheet.sheetId)).not.toBeNull();
  });

  it('S-93 partial first morning save is accepted; unsent lines then count as 0 (OD-13.6, accepted risk)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await submitted({ products: [{ tray: true }], clients: 2 });
    await ctx.seedMorning(sheet, [m(c1, p, 10)]);
    const rows = (await ctx.api.getSheet(sheet.sheetId)).body.milkGrid.rows;
    expect(rows.find((r: any) => r.clientId === c2.id)[`product_${p.id}`]).toBe(
      0,
    );
    const tray = await ctx.trayRows(sheet.sheetId);
    expect(tray).toHaveLength(1);
    expect(tray[0]).toMatchObject({ client_id: c1.id, trays_taken: 10 });
  });

  it('S-94 nothing processed → 200, token unchanged, flag not set, no tray recalculation', async () => {
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await submitted({ products: [{ tray: true }], clients: 2 });
    await ctx.db.client_tray_transaction.updateMany({
      where: { order_sheet_id: sheet.sheetId },
      data: { trays_taken: 999 },
    });
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.morning(
      sheet.sheetId,
      [{ clientId: c1.id, productId: p.id }, m(c1, p, null), m(c2, p, '')],
      t,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.itemsUpdatedAt).toBe(t);
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
    expect(await flagOf(sheet.sheetId)).toBeNull();
    expect(
      (await ctx.trayRows(sheet.sheetId)).every((r) => r.trays_taken === 999),
    ).toBe(true);
  });

  it('S-95 paper DRAFT / MORNING_SUBMITTED / FINALIZED → 400 with status text', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    for (const status of ['DRAFT', 'MORNING_SUBMITTED', 'FINALIZED'] as const) {
      await ctx.setStatus(sheet, status);
      const res = await ctx.api.morning(sheet.sheetId, [m(c, p, 1)], null);
      expect(res.status, status).toBe(400);
      expect(res.body.message).toBe(
        `Cannot edit morning entries when paper is ${status}. Allowed statuses: NIGHT_SUBMITTED, REOPENED`,
      );
    }
  });

  it('S-96a REOPENED correction recalculates trays and queues a forward cascade outbox row', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted({ products: [{ tray: true }] });
    await ctx.seedMorning(sheet, [m(c, p, 10)]);
    await ctx.setStatus(sheet, 'REOPENED');
    await ctx.seedMorning(sheet, [m(c, p, 8)]);
    expect((await ctx.trayRows(sheet.sheetId))[0].trays_taken).toBe(8);
    const outbox = await ctx.db.propagation_outbox.findMany({
      where: { paper_id: sheet.paperId },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
      resume_from_id: sheet.sheetId,
      status: 'PENDING',
    });
  });

  it("S-96b REOPENED correction that would strand a later sheet's return → 409, nothing saved", async () => {
    const { world } = ctx;
    const {
      sheet,
      group,
      products: [p],
      clients: [c],
    } = await submitted({ products: [{ tray: true }] });
    await ctx.seedMorning(sheet, [m(c, p, 5)]);
    await ctx.setStatus(sheet, 'REOPENED');
    // later paper of the same group holding a return of 5
    const later = await world.newSheet({ group });
    await ctx.db.client_tray_transaction.create({
      data: {
        order_sheet_id: later.sheetId,
        client_id: c.id,
        tray_type_id: world.brandTray.trayTypeId!,
        category: 'MILK',
        opening_balance: 5,
        trays_taken: 0,
        trays_returned: 5,
        closing_balance: 0,
      },
    });
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.morning(sheet.sheetId, [m(c, p, 3)], t);
    expect(res.status, body(res)).toBe(409);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(
      num((await ctx.line(sheet.sheetId, c.id, p.id))!.delivered_qty),
    ).toBe(5);
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
    expect(
      await ctx.db.propagation_outbox.count({
        where: { paper_id: sheet.paperId },
      }),
    ).toBe(0);
  });

  it('S-97 / S-143 NIGHT_SUBMITTED after a morning save: billed line keeps original rate, GST %, inclusive flag', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await ctx.seedMorning(sheet, [m(c, p, 10)]);
    await world.setDistRate(p.links[world.distA.id], 70);
    await ctx.db.master_product.update({
      where: { id: p.id },
      data: { gst_percentage: 12 },
    });
    await ctx.seedMorning(sheet, [m(c, p, 8)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.final_selling_rate)).toBe(56);
    expect(num(l.final_gst_percentage)).toBe(0);
    expect(l.final_gst_inclusive).toBe(false);
    expect(num(l.final_bill_amount)).toBe(5376);
  });

  it('S-142 first morning save prices at the live rate and current GST; flag set afterwards', async () => {
    const { world } = ctx;
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await submitted();
    await world.setDistRate(p.links[world.distA.id], 70);
    await ctx.db.master_product.update({
      where: { id: p.id },
      data: { gst_percentage: 18 },
    });
    expect(await flagOf(sheet.sheetId)).toBeNull();
    await ctx.seedMorning(sheet, [m(c, p, 10)]);
    const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
    expect(num(l.final_selling_rate)).toBe(70);
    expect(num(l.final_gst_percentage)).toBe(18);
    expect(num(l.final_taxable_amount)).toBe(8400);
    expect(num(l.final_gst_amount)).toBe(1512);
    expect(num(l.final_bill_amount)).toBe(9912);
    expect(await flagOf(sheet.sheetId)).not.toBeNull();
  });
});
