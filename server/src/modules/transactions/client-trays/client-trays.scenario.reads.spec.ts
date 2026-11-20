/**
 * Client Trays – sheet view (GET /client-trays/sheet/:sheetId).
 * Scenarios: T-10 .. T-26   (spec: CT-2.x, CT-3.x, CT-4.6, CT-5.13, CT-6.x, CT-8.x, CT-14.4, CT-14.5)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  m,
  n,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  addDays,
  cell,
  cleanupTrayTests,
  extraTrayType,
  leaves,
  ret,
  rowOf,
  seedLedger,
  setTrayActive,
  sheetWithOpening,
  submittedWithTrays,
  traysApi,
  tt,
  utc,
  type ColNode,
} from '../../../../test/helper/client-trays-helpers.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

describe('Client Trays sheet view', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = traysApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  const view = async (sheetId: number) => {
    const res = await api.get(sheetId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body;
  };
  const D = utc(2094, 6, 20);

  it('T-10 DRAFT: ordered-based numbers, editable false, token null', async () => {
    const s = await submittedWithTrays(ctx, { qty: 3, status: 'DRAFT' });
    const [c] = s.clients;
    const body = await view(s.sheet.sheetId);
    expect(body.workflow).toMatchObject({ status: 'DRAFT', editable: false });
    expect(body.sheet.client_trays_updated_at).toBeNull();
    expect(cell(rowOf(body, 'milkTrayGrid', c.id), tt(ctx))).toEqual({
      opening: 0,
      taken: 3,
      returned: 0,
      closing: 3,
    });
  });

  it('T-11 NIGHT_SUBMITTED before any Orders morning save: ordered-based, editable', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const body = await view(s.sheet.sheetId);
    expect(body.workflow).toMatchObject({
      status: 'NIGHT_SUBMITTED',
      editable: true,
    });
    expect(
      cell(rowOf(body, 'milkTrayGrid', s.clients[0].id), tt(ctx)).taken,
    ).toBe(5);
  });

  it('T-12 after an Orders morning save (and after a PA-18 revert): delivered-based, editable', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const [c] = s.clients;
    const [p] = s.products;
    await ctx.seedMorning(s.sheet, [m(c, p, 4)]);
    let body = await view(s.sheet.sheetId);
    expect(body.workflow.editable).toBe(true);
    expect(cell(rowOf(body, 'milkTrayGrid', c.id), tt(ctx)).taken).toBe(4);
    await ctx.setStatus(s.sheet, 'MORNING_SUBMITTED');
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED'); // the PA-18 revert keeps the morning-saved flag
    body = await view(s.sheet.sheetId);
    expect(cell(rowOf(body, 'milkTrayGrid', c.id), tt(ctx)).taken).toBe(4);
  });

  it('T-13 MORNING_SUBMITTED / FINALIZED: delivered, not editable; REOPENED: delivered, editable', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5 });
    const [c] = s.clients;
    await ctx.seedMorning(s.sheet, [m(c, s.products[0], 4)]);
    for (const [status, editable] of [
      ['MORNING_SUBMITTED', false],
      ['FINALIZED', false],
      ['REOPENED', true],
    ] as const) {
      await ctx.setStatus(s.sheet, status);
      const body = await view(s.sheet.sheetId);
      expect(body.workflow.editable, status).toBe(editable);
      expect(
        cell(rowOf(body, 'milkTrayGrid', c.id), tt(ctx)).taken,
        status,
      ).toBe(4);
    }
  });

  it('T-14 column layout: pinned Client, brand group, colour group, Opening/Trays/Returned/Closing; only Returned editable (active type)', async () => {
    const s = await submittedWithTrays(ctx);
    const body = await view(s.sheet.sheetId);
    const cols = body.milkTrayGrid.columns as ColNode[];
    const id = tt(ctx);
    expect(cols[0]).toMatchObject({
      headerName: 'Client',
      field: 'clientName',
      pinned: 'left',
    });
    expect(cols[1].headerName).toMatch(/ Tray$/);
    const colour = cols[1].children![0];
    expect(colour.headerName).toMatch(/ Tray$/);
    expect(colour.children!.map((x) => x.headerName)).toEqual([
      'Opening',
      'Trays',
      'Returned',
      'Closing',
    ]);
    expect(colour.children!.map((x) => x.field)).toEqual([
      `tray_${id}_opening`,
      `tray_${id}`,
      `tray_${id}_returned`,
      `tray_${id}_closing`,
    ]);
    expect(colour.children!.map((x) => x.editable)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it('T-15 rows only for clients with a ledger line, sorted by name; every tray column filled with 0', async () => {
    const s = await ctx.world.scene({
      products: [{ tray: true }],
      clients: 3,
      saleDate: D,
    });
    const [a, b] = s.clients;
    const X = tt(ctx);
    const Y = (await extraTrayType(ctx)).id;
    const prev = await ctx.world.newSheet({
      group: s.group,
      saleDate: addDays(D, -1),
    });
    await seedLedger(ctx, prev.sheetId, a.id, X, { taken: 4, closing: 4 });
    await seedLedger(ctx, prev.sheetId, b.id, Y, { taken: 6, closing: 6 });
    const body = await view(s.sheet.sheetId);
    const names = body.milkTrayGrid.rows.map((r: any) => r.clientName);
    expect(names).toEqual([a.name, b.name].sort((x, y) => x.localeCompare(y)));
    expect(cell(rowOf(body, 'milkTrayGrid', a.id), X).opening).toBe(4);
    expect(cell(rowOf(body, 'milkTrayGrid', a.id), Y)).toEqual({
      opening: 0,
      taken: 0,
      returned: 0,
      closing: 0,
    });
    expect(cell(rowOf(body, 'milkTrayGrid', b.id), X)).toEqual({
      opening: 0,
      taken: 0,
      returned: 0,
      closing: 0,
    });
    expect(cell(rowOf(body, 'milkTrayGrid', b.id), Y).opening).toBe(6);
    expect(rowOf(body, 'milkTrayGrid', s.clients[2].id)).toBeUndefined();
  });

  it('T-16 a legacy null return shows 0, never empty', async () => {
    const s = await submittedWithTrays(ctx, { qty: 2 });
    await ctx.db.client_tray_transaction.updateMany({
      where: { order_sheet_id: s.sheet.sheetId },
      data: { trays_returned: null },
    });
    const body = await view(s.sheet.sheetId);
    expect(
      cell(rowOf(body, 'milkTrayGrid', s.clients[0].id), tt(ctx)).returned,
    ).toBe(0);
  });

  it('T-17 totals: client count and opening / taken / returned / closing per tray type', async () => {
    const s = await ctx.world.scene({ products: [{ tray: true }], clients: 2 });
    const [c1, c2] = s.clients;
    await ctx.seedNight(s.sheet, [
      n(c1, s.products[0], 2),
      n(c2, s.products[0], 3),
    ]);
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    const { milkTrayGrid } = await view(s.sheet.sheetId);
    expect(milkTrayGrid.totals.totalClients).toBe(2);
    expect(milkTrayGrid.totals[`tray_${tt(ctx)}`]).toEqual({
      opening: 0,
      taken: 5,
      returned: 0,
      closing: 5,
    });
  });

  it('T-18 same client and tray type in milk and non-milk: two grids, separate numbers and separate returns', async () => {
    const s = await submittedWithTrays(ctx, {
      products: [{ tray: true }, { tray: true, category: 'NON_MILK' as never }],
      qty: 1,
    });
    const [c] = s.clients;
    let body = await view(s.sheet.sheetId);
    expect(cell(rowOf(body, 'milkTrayGrid', c.id), tt(ctx)).taken).toBe(1);
    expect(cell(rowOf(body, 'nonMilkTrayGrid', c.id), tt(ctx)).taken).toBe(1);
    const res = await api.save(
      s.sheet.sheetId,
      [ret(c.id, tt(ctx), 1, 'MILK')],
      null,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    body = await view(s.sheet.sheetId);
    expect(cell(rowOf(body, 'milkTrayGrid', c.id), tt(ctx))).toMatchObject({
      returned: 1,
      closing: 0,
    });
    expect(cell(rowOf(body, 'nonMilkTrayGrid', c.id), tt(ctx))).toMatchObject({
      returned: 0,
      closing: 1,
    });
  });

  it('T-19 client with an opening balance but no order lines stays visible after deactivation and a group move', async () => {
    const s = await sheetWithOpening(ctx, D, 3, 0);
    const other = await ctx.world.addGroup();
    await ctx.db.master_client.update({
      where: { id: s.c.id },
      data: { is_active: false, delivery_group_id: other.id },
    });
    const body = await view(s.sheet.sheetId);
    const row = rowOf(body, 'milkTrayGrid', s.c.id);
    expect(row.clientName).toBe(s.c.name);
    expect(cell(row, tt(ctx)).opening).toBe(3);
  });

  it('T-20 client with no balance and no delivery on this sheet is not shown', async () => {
    const s = await ctx.world.scene({ products: [{ tray: true }], clients: 2 });
    const [c1, c2] = s.clients;
    await ctx.seedNight(s.sheet, [n(c1, s.products[0], 2)]);
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    const body = await view(s.sheet.sheetId);
    expect(rowOf(body, 'milkTrayGrid', c1.id)).toBeDefined();
    expect(rowOf(body, 'milkTrayGrid', c2.id)).toBeUndefined();
    expect(rowOf(body, 'nonMilkTrayGrid', c2.id)).toBeUndefined();
  });

  it('T-21 inactive tray type with an open balance: column shown, Returned not editable', async () => {
    const s = await sheetWithOpening(ctx, D, 3, 0);
    await setTrayActive(ctx, tt(ctx), false);
    const body = await view(s.sheet.sheetId);
    const returned = leaves(body.milkTrayGrid.columns).find(
      (x) => x.field === `tray_${tt(ctx)}_returned`,
    )!;
    expect(returned).toBeDefined();
    expect(returned.editable).toBe(false);
    expect(cell(rowOf(body, 'milkTrayGrid', s.c.id), tt(ctx)).opening).toBe(3);
  });

  describe('T-22 opening balance carries across gaps', () => {
    it('T-22a the previous sheet has no line, an older one closed at 4 → opening 4', async () => {
      const s = await ctx.world.scene({
        products: [{ tray: true }],
        clients: 1,
        saleDate: D,
      });
      const [c] = s.clients;
      await ctx.world.newSheet({ group: s.group, saleDate: addDays(D, -1) }); // empty previous sheet
      const older = await ctx.world.newSheet({
        group: s.group,
        saleDate: addDays(D, -3),
      });
      await seedLedger(ctx, older.sheetId, c.id, tt(ctx), {
        taken: 4,
        closing: 4,
      });
      const row = rowOf(await view(s.sheet.sheetId), 'milkTrayGrid', c.id);
      expect(cell(row, tt(ctx))).toEqual({
        opening: 4,
        taken: 0,
        returned: 0,
        closing: 4,
      });
    });

    it('T-22b a latest earlier closing of 0 gives opening 0', async () => {
      const s = await ctx.world.scene({
        products: [{ tray: true }],
        clients: 1,
        saleDate: D,
      });
      const [c] = s.clients;
      const older = await ctx.world.newSheet({
        group: s.group,
        saleDate: addDays(D, -3),
      });
      const newer = await ctx.world.newSheet({
        group: s.group,
        saleDate: addDays(D, -1),
      });
      await seedLedger(ctx, older.sheetId, c.id, tt(ctx), {
        taken: 4,
        closing: 4,
      });
      await seedLedger(ctx, newer.sheetId, c.id, tt(ctx), {
        opening: 4,
        returned: 4,
        closing: 0,
      });
      await ctx.seedNight(s.sheet, [n(c, s.products[0], 1)]);
      const row = rowOf(await view(s.sheet.sheetId), 'milkTrayGrid', c.id);
      expect(cell(row, tt(ctx))).toMatchObject({
        opening: 0,
        taken: 1,
        closing: 1,
      });
    });

    it('T-22c a client in a different (new) group starts at 0', async () => {
      const s = await ctx.world.scene({
        products: [{ tray: true }],
        clients: 1,
        saleDate: D,
      });
      const [c] = s.clients;
      const otherGroup = await ctx.world.addGroup();
      const elsewhere = await ctx.world.newSheet({
        group: otherGroup,
        saleDate: addDays(D, -1),
      });
      await seedLedger(ctx, elsewhere.sheetId, c.id, tt(ctx), {
        taken: 9,
        closing: 9,
      });
      await ctx.seedNight(s.sheet, [n(c, s.products[0], 1)]);
      const row = rowOf(await view(s.sheet.sheetId), 'milkTrayGrid', c.id);
      expect(cell(row, tt(ctx))).toMatchObject({
        opening: 0,
        taken: 1,
        closing: 1,
      });
    });
  });

  it('T-23 three lines of 0.4 crates → 1 tray; 10.5 → 11; 10.4 → 10 (sum, then round once, half-up)', async () => {
    const s = await ctx.world.scene({
      products: [{ tray: true }, { tray: true }, { tray: true }],
      clients: 1,
    });
    const [c] = s.clients;
    await ctx.seedNight(
      s.sheet,
      s.products.map((p) => n(c, p, 0.4)),
    );
    expect(
      cell(rowOf(await view(s.sheet.sheetId), 'milkTrayGrid', c.id), tt(ctx))
        .taken,
    ).toBe(1);

    const single = await ctx.world.scene({
      products: [{ tray: true }],
      clients: 1,
    });
    const [c2] = single.clients;
    await ctx.seedNight(single.sheet, [n(c2, single.products[0], 10.5)]);
    expect(
      cell(
        rowOf(await view(single.sheet.sheetId), 'milkTrayGrid', c2.id),
        tt(ctx),
      ).taken,
    ).toBe(11);
    await ctx.seedNight(single.sheet, [n(c2, single.products[0], 10.4)]);
    expect(
      cell(
        rowOf(await view(single.sheet.sheetId), 'milkTrayGrid', c2.id),
        tt(ctx),
      ).taken,
    ).toBe(10);
  });

  it('T-24 a cancelled line, or a null delivered once delivered quantities are in use, contributes 0', async () => {
    const s = await ctx.world.scene({ products: [{ tray: true }], clients: 3 });
    const [c1, c2, c3] = s.clients;
    const [p] = s.products;
    await ctx.seedNight(s.sheet, [n(c1, p, 5), n(c2, p, 5), n(c3, p, 5)]);
    await ctx.seedNight(s.sheet, [n(c3, p, 0)]); // cancelled
    await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
    let body = await view(s.sheet.sheetId);
    expect(rowOf(body, 'milkTrayGrid', c3.id)).toBeUndefined();
    await ctx.seedMorning(s.sheet, [m(c1, p, 4)]); // c2 delivered stays null
    body = await view(s.sheet.sheetId);
    expect(cell(rowOf(body, 'milkTrayGrid', c1.id), tt(ctx)).taken).toBe(4);
    expect(rowOf(body, 'milkTrayGrid', c2.id)).toBeUndefined();
  });

  describe('T-25 tray type resolution', () => {
    it('T-25a a product with no tray type and no matching rule produces no trays', async () => {
      const s = await ctx.world.scene({ products: [{}], clients: 1 });
      await ctx.seedNight(s.sheet, [n(s.clients[0], s.products[0], 5)]);
      await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
      const body = await view(s.sheet.sheetId);
      expect(body.milkTrayGrid.rows).toHaveLength(0);
      expect(await ctx.trayRows(s.sheet.sheetId)).toHaveLength(0);
    });

    it('T-25b a line with a stored tray type ignores later rule changes', async () => {
      const s = await submittedWithTrays(ctx, { qty: 2 });
      const active = await ctx.db.product_tray_rule.findMany({
        where: { is_active: true, tray_type_id: tt(ctx) },
        select: { id: true },
      });
      expect(active.length).toBeGreaterThan(0);
      const ids = active.map((r) => r.id);
      try {
        await ctx.db.product_tray_rule.updateMany({
          where: { id: { in: ids } },
          data: { is_active: false },
        });
        const body = await view(s.sheet.sheetId);
        expect(
          cell(rowOf(body, 'milkTrayGrid', s.clients[0].id), tt(ctx)).taken,
        ).toBe(2);
      } finally {
        await ctx.db.product_tray_rule.updateMany({
          where: { id: { in: ids } },
          data: { is_active: true },
        });
      }
    });

    it('T-25c [service seam] several matching rules: most specific wins, then lowest id; no match → none', () => {
      const svc = ctx.app.get(TrayCalculationService, { strict: false });
      const rule = (
        id: number,
        brand: number | null,
        group: number | null,
        tray: number,
      ) =>
        ({
          id,
          brand_id: brand,
          product_group_id: group,
          product_type_id: null,
          packaging_type_id: null,
          applies_to_packaging: false,
          tray_type_id: tray,
        }) as never;
      const product = {
        brand_id: 1,
        product_group_id: 2,
        product_type_id: 3,
        packaging_type_id: 4,
      };
      const rules = [
        rule(10, null, null, 100),
        rule(11, 1, null, 101),
        rule(13, 1, 2, 103),
        rule(12, 1, 2, 102),
      ];
      expect(svc.resolveTrayRule(product, rules)?.tray_type_id).toBe(102);
      expect(
        svc.resolveTrayRule({ ...product, brand_id: 9 }, [
          rule(11, 1, null, 101),
        ]),
      ).toBeNull();
    });
  });

  it('T-26 a stored return above its balance (legacy) still renders; no error', async () => {
    const s = await submittedWithTrays(ctx, { qty: 5, clients: 2 });
    const [c1, c2] = s.clients;
    await ctx.db.client_tray_transaction.updateMany({
      where: { order_sheet_id: s.sheet.sheetId, client_id: c1.id },
      data: { trays_returned: 9, closing_balance: -4 },
    });
    // a stranded return on a row with no balance at all
    const empty = await ctx.world.scene({
      products: [{ tray: true }],
      clients: 1,
    });
    await ctx.setStatus(empty.sheet, 'NIGHT_SUBMITTED');
    await seedLedger(ctx, empty.sheet.sheetId, empty.clients[0].id, tt(ctx), {
      returned: 3,
      closing: -3,
    });

    const body = await view(s.sheet.sheetId);
    expect(cell(rowOf(body, 'milkTrayGrid', c1.id), tt(ctx)).returned).toBe(9);
    expect(rowOf(body, 'milkTrayGrid', c2.id)).toBeDefined();
    const bodyEmpty = await view(empty.sheet.sheetId);
    expect(
      cell(rowOf(bodyEmpty, 'milkTrayGrid', empty.clients[0].id), tt(ctx))
        .returned,
    ).toBe(3);
  });
});
