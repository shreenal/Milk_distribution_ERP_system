/**
 * Orders – read endpoints.
 * Scenarios: S-10 .. S-24   (spec: OD-3.x, OD-4.x, OD-14.1)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  leafFields,
  m,
  n,
  num,
  pathTo,
  type ColumnNode,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';

const MISSING = 2000000000;

describe('Orders reads', () => {
  let ctx: OrdersCtx;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  const rowOf = (
    body: any,
    grid: 'milkGrid' | 'nonMilkGrid',
    clientId: number,
  ) => body[grid].rows.find((r: any) => r.clientId === clientId);

  it('S-10 missing sheet → 404 "Order sheet not found" on every endpoint', async () => {
    const { call, tokens, api } = ctx;
    const base = `/orders/sheet/${MISSING}`;
    const entries = [{ clientId: 1, productId: 1, orderedQty: 1 }];
    const results = {
      sheet: await api.getSheet(MISSING),
      items: await api.getItems(MISSING),
      night: await call('post', `${base}/night-save`, tokens.emp, {
        entries,
        expectedUpdatedAt: null,
      }),
      morning: await call('post', `${base}/morning-save`, tokens.emp, {
        entries: [{ clientId: 1, productId: 1, deliveredQty: 1 }],
        expectedUpdatedAt: null,
      }),
      add: await call('post', `${base}/products`, tokens.emp, {
        productId: 1,
        expectedUpdatedAt: null,
      }),
      remove: await call(
        'delete',
        `${base}/products/1?expectedUpdatedAt=null`,
        tokens.emp,
      ),
    };
    for (const [k, r] of Object.entries(results)) {
      expect(r.status, k).toBe(404);
      expect(r.body.message, k).toBe('Order sheet not found');
    }
  });

  it('S-11 id format: abc / 0 / -1 / 2147483648 → 400 "Invalid id"; 007-style is accepted', async () => {
    const { sheet } = await ctx.world.scene();
    for (const bad of ['abc', '0', '-1', '2147483648']) {
      const r = await ctx.api.getSheet(bad);
      expect(r.status, bad).toBe(400);
      expect(r.body.message).toBe('Invalid id');
    }
    const padded = await ctx.api.getSheet(`000${sheet.sheetId}`);
    expect(padded.status).toBe(200);
  });

  it('S-12 DRAFT, never saved: token null, editable; after a save shows ordered qty and night bill', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    const first = await ctx.api.getSheet(sheet.sheetId);
    expect(first.status).toBe(200);
    expect(first.body.itemsUpdatedAt).toBeNull();
    expect(first.body.workflow).toMatchObject({
      status: 'DRAFT',
      editable: true,
    });

    await ctx.seedNight(sheet, [n(c, p, 3)]);
    const after = await ctx.api.getSheet(sheet.sheetId);
    const row = rowOf(after.body, 'milkGrid', c.id);
    expect(row[`product_${p.id}`]).toBe(3);
    expect(row.billAmount).toBe(2016); // 3 crates x 12 L x 56
    expect(after.body.itemsUpdatedAt).not.toBeNull();
  });

  it('S-13 NIGHT_SUBMITTED before any morning save still shows ordered qty / night bill', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 5)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const res = await ctx.api.getSheet(sheet.sheetId);
    const row = rowOf(res.body, 'milkGrid', c.id);
    expect(row[`product_${p.id}`]).toBe(5);
    expect(row.billAmount).toBe(3360);
    expect(res.body.workflow.editable).toBe(true);
  });

  it('S-14 after a morning save (and when REOPENED) delivered qty / final bill; blank delivered shows 0', async () => {
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.seedNight(sheet, [n(c1, p, 5), n(c2, p, 5)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(sheet, [m(c1, p, 4)]);
    for (const status of ['NIGHT_SUBMITTED', 'REOPENED'] as const) {
      await ctx.setStatus(sheet, status);
      const body = (await ctx.api.getSheet(sheet.sheetId)).body;
      const r1 = rowOf(body, 'milkGrid', c1.id);
      const r2 = rowOf(body, 'milkGrid', c2.id);
      expect(r1[`product_${p.id}`], status).toBe(4);
      expect(r1.billAmount, status).toBe(2688);
      expect(r2[`product_${p.id}`], status).toBe(0);
    }
  });

  it('S-15 MORNING_SUBMITTED / FINALIZED show delivered qty and are not editable', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 5)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(sheet, [m(c, p, 4)]);
    for (const status of ['MORNING_SUBMITTED', 'FINALIZED'] as const) {
      await ctx.setStatus(sheet, status);
      const body = (await ctx.api.getSheet(sheet.sheetId)).body;
      expect(rowOf(body, 'milkGrid', c.id)[`product_${p.id}`], status).toBe(4);
      expect(body.workflow.editable, status).toBe(false);
    }
  });

  it('S-16 eligible client appears as a row with no order', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const body = (await ctx.api.getSheet(sheet.sheetId)).body;
    const row = rowOf(body, 'milkGrid', c.id);
    expect(row).toBeDefined();
    expect(row.billAmount).toBe(0);
    expect(rowOf(body, 'nonMilkGrid', c.id)).toBeDefined();
  });

  it('S-17 client with lines stays visible after being deactivated and moved', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 1)]);
    const other = await ctx.world.addGroup();
    await ctx.db.master_client.update({
      where: { id: c.id },
      data: { is_active: false, delivery_group_id: other.id },
    });
    const body = (await ctx.api.getSheet(sheet.sheetId)).body;
    expect(rowOf(body, 'milkGrid', c.id)).toBeDefined();
  });

  it('S-18 default (active) and explicitly added products are columns; inactive / unlinked are not', async () => {
    const w = ctx.world;
    const group = await w.addGroup();
    await w.addClient({ group });
    const def = await w.addProduct({ showByDefault: true });
    const explicit = await w.addProduct();
    const unlinked = await w.addProduct();
    const inactiveDefault = await w.addProduct({
      showByDefault: true,
      active: false,
    });
    const sheet = await w.newSheet({ group, products: [explicit] });
    const fields = leafFields(
      (await ctx.api.getSheet(sheet.sheetId)).body.milkGrid.columns,
    );
    expect(fields).toContain(`product_${def.id}`);
    expect(fields).toContain(`product_${explicit.id}`);
    expect(fields).not.toContain(`product_${unlinked.id}`);
    expect(fields).not.toContain(`product_${inactiveDefault.id}`);
  });

  it('S-19 product billed on the sheet and later deactivated is still a column', async () => {
    const w = ctx.world;
    const group = await w.addGroup();
    const c = await w.addClient({ group });
    const p = await w.addProduct({ showByDefault: true });
    const sheet = await w.newSheet({ group });
    await ctx.seedNight(sheet, [n(c, p, 1)]);
    await ctx.db.master_product.update({
      where: { id: p.id },
      data: { is_active: false },
    });
    const fields = leafFields(
      (await ctx.api.getSheet(sheet.sheetId)).body.milkGrid.columns,
    );
    expect(fields).toContain(`product_${p.id}`);
  });

  it('S-20 column hierarchy: milk has no packaging level, non-milk has; fields are product_<id>', async () => {
    const {
      sheet,
      products: [milk, nonMilk],
    } = await ctx.world.scene({
      products: [{}, { category: 'NON_MILK' as never }],
    });
    const body = (await ctx.api.getSheet(sheet.sheetId)).body;
    const milkPath = pathTo(
      body.milkGrid.columns as ColumnNode[],
      `product_${milk.id}`,
    )!;
    const nmPath = pathTo(
      body.nonMilkGrid.columns as ColumnNode[],
      `product_${nonMilk.id}`,
    )!;
    expect(milkPath).toHaveLength(4); // brand > group > type > size
    expect(milkPath[3]).toBe(`${milk.size}L`);
    expect(nmPath).toHaveLength(5); // brand > group > type > packaging > size
    expect(nmPath[3]).toBe(ctx.world.packName);
    expect(nmPath[4]).toBe(`${nonMilk.size}L`);
  });

  it('S-21 ordering, row bill = sum of line bills, totals', async () => {
    const w = ctx.world;
    const group = await w.addGroup();
    const cB = await w.addClient({ group, name: 'Bravo' });
    const cA = await w.addClient({ group, name: 'Alpha' });
    const cC = await w.addClient({ group, name: 'Charlie' });
    const pA = await w.addProduct({ displayOrder: 2 });
    const pB = await w.addProduct({ displayOrder: 1 });
    const pC = await w.addProduct({ displayOrder: null });
    const sheet = await w.newSheet({ group, products: [pA, pB, pC] });
    await ctx.seedNight(sheet, [n(cA, pA, 1), n(cA, pB, 2), n(cB, pC, 1)]);
    const body = (await ctx.api.getSheet(sheet.sheetId)).body;

    const mine = [`product_${pA.id}`, `product_${pB.id}`, `product_${pC.id}`];
    const order = leafFields(body.milkGrid.columns).filter((f) =>
      mine.includes(f),
    );
    expect(order).toEqual([
      `product_${pB.id}`,
      `product_${pA.id}`,
      `product_${pC.id}`,
    ]);
    expect(body.milkGrid.rows.map((r: any) => r.clientName)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(rowOf(body, 'milkGrid', cA.id).billAmount).toBe(2016);
    expect(rowOf(body, 'milkGrid', cB.id).billAmount).toBe(672);
    expect(rowOf(body, 'milkGrid', cC.id).billAmount).toBe(0);
    expect(body.milkGrid.totals).toEqual({
      totalClients: 3,
      totalBillAmount: 2688,
    });
  });

  it('S-22 GET /orders/products?category=MILK returns the active MILK catalog (incl. products already on a sheet)', async () => {
    const {
      products: [onSheet],
    } = await ctx.world.scene();
    const inactive = await ctx.world.addProduct({ active: false });
    const nonMilk = await ctx.world.addProduct({
      category: 'NON_MILK' as never,
    });
    const body = (await ctx.api.getProducts('MILK')).body as { id: number }[];
    const ids = body.map((x) => x.id);
    expect(ids).toContain(onSheet.id);
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(nonMilk.id);
  });

  it('S-23 category missing or invalid → 400', async () => {
    expect(
      (await ctx.call('get', '/orders/products', ctx.tokens.emp)).status,
    ).toBe(400);
    expect((await ctx.api.getProducts('FOO')).status).toBe(400);
  });

  it('S-24 GET items returns raw lines (no workflow, no totals); 404 for missing sheet', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 2)]);
    const res = await ctx.api.getItems(sheet.sheetId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ client_id: c.id, product_id: p.id });
    expect(res.body[0].product_link.distributor).toBeDefined();
    expect(num(res.body[0].ordered_qty)).toBe(2);
    expect((await ctx.api.getItems(MISSING)).status).toBe(404);
  });
});
