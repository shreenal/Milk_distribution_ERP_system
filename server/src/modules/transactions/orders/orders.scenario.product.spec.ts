/**
 * Orders – product add / remove on a sheet.
 * Scenarios: S-100 .. S-110   (spec: OD-2.1, OD-11.x, OD-12.x)
 *
 * POST /products has no explicit status in the spec ("refreshed sheet"), so any 2xx is accepted.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  leafFields,
  n,
  STALE_MESSAGE,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';

describe('Orders product add / remove', () => {
  let ctx: OrdersCtx;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const is2xx = (s: number) => s >= 200 && s < 300;
  const columns = (res: { body: any }) => leafFields(res.body.milkGrid.columns);
  const linkExists = async (sheetId: number, productId: number) =>
    (await ctx.db.order_sheet_product.count({
      where: { order_sheet_id: sheetId, product_id: productId },
    })) > 0;

  /** A DRAFT sheet with no products, plus an unlinked non-default product ready to be added. */
  async function emptySheet() {
    const s = await ctx.world.scene({ products: [] });
    const p = await ctx.world.addProduct();
    return { ...s, p };
  }

  it('S-100 add valid active product with the current token → refreshed sheet, link created, token advanced', async () => {
    const { sheet, p } = await emptySheet();
    const res = await ctx.api.addProduct(sheet.sheetId, p.id, null);
    expect(is2xx(res.status), body(res)).toBe(true);
    expect(res.body.itemsUpdatedAt).not.toBeNull();
    expect(res.body.itemsUpdatedAt).toBe(await ctx.tokenOf(sheet.sheetId));
    expect(columns(res)).toContain(`product_${p.id}`);
    expect(await linkExists(sheet.sheetId, p.id)).toBe(true);
  });

  it('S-101 product already explicitly added → 400 "Product already exists in this sheet"; token rolled back', async () => {
    const {
      sheet,
      products: [p],
    } = await ctx.world.scene(); // scene links its product explicitly
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.addProduct(sheet.sheetId, p.id, t);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      'Product already exists in this sheet',
    );
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
  });

  it('S-102a default product that is not linked: allowed (harmless)', async () => {
    const { sheet } = await emptySheet();
    const d = await ctx.world.addProduct({ showByDefault: true });
    const res = await ctx.api.addProduct(sheet.sheetId, d.id, null);
    expect(is2xx(res.status), body(res)).toBe(true);
    expect(await linkExists(sheet.sheetId, d.id)).toBe(true);
  });

  it('S-102b inactive product → 400; unknown product → 400; nothing saved, token unchanged', async () => {
    const { sheet } = await emptySheet();
    const inactive = await ctx.world.addProduct({ active: false });
    const r1 = await ctx.api.addProduct(sheet.sheetId, inactive.id, null);
    expect(r1.status).toBe(400);
    expect(JSON.stringify(r1.body.message)).toContain(
      `Product ${inactive.id} is inactive and cannot be ordered`,
    );
    const r2 = await ctx.api.addProduct(sheet.sheetId, 2000000000, null);
    expect(r2.status).toBe(400);
    expect(JSON.stringify(r2.body.message)).toContain(
      'Product with ID 2000000000 not found',
    );
    expect(await linkExists(sheet.sheetId, inactive.id)).toBe(false);
    expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-103 paper not DRAFT → 400 on add and on remove; nothing changes', async () => {
    const { sheet, p } = await emptySheet();
    const linked = await ctx.world.addProduct();
    await ctx.world.linkProductToSheet(sheet, linked);
    for (const status of [
      'NIGHT_SUBMITTED',
      'MORNING_SUBMITTED',
      'FINALIZED',
      'REOPENED',
    ] as const) {
      await ctx.setStatus(sheet, status);
      const add = await ctx.api.addProduct(sheet.sheetId, p.id, null);
      expect(add.status, `add ${status}`).toBe(400);
      expect(add.body.message).toBe(
        'Products can only be added while the paper is in DRAFT',
      );
      const rem = await ctx.api.removeProduct(sheet.sheetId, linked.id, null);
      expect(rem.status, `remove ${status}`).toBe(400);
      expect(rem.body.message).toBe(
        'Products can only be removed while the paper is in DRAFT',
      );
    }
    expect(await linkExists(sheet.sheetId, p.id)).toBe(false);
    expect(await linkExists(sheet.sheetId, linked.id)).toBe(true);
  });

  it('S-104 stale token → 409; token omitted → 400 (add and remove)', async () => {
    const {
      sheet,
      products: [p0],
      clients: [c],
    } = await ctx.world.scene();
    const p = await ctx.world.addProduct();
    await ctx.seedNight(sheet, [n(c, p0, 1)]); // token now set
    const stale = '2020-01-01T00:00:00.000Z';

    const addStale = await ctx.api.addProduct(sheet.sheetId, p.id, stale);
    expect(addStale.status).toBe(409);
    expect(addStale.body.message).toBe(STALE_MESSAGE);
    const remStale = await ctx.api.removeProduct(sheet.sheetId, p0.id, stale);
    expect(remStale.status).toBe(409);

    const addOmitted = await ctx.call(
      'post',
      `/orders/sheet/${sheet.sheetId}/products`,
      ctx.tokens.emp,
      { productId: p.id },
    );
    expect(addOmitted.status).toBe(400);
    const remOmitted = await ctx.api.removeProduct(
      sheet.sheetId,
      p0.id,
      undefined,
    );
    expect(remOmitted.status).toBe(400);
    expect(await linkExists(sheet.sheetId, p.id)).toBe(false);
  });

  it('S-105 remove non-default product with only zeroed lines → link and lines deleted, refreshed sheet, token advanced', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 2)]);
    await ctx.seedNight(sheet, [n(c, p, 0)]);
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.removeProduct(sheet.sheetId, p.id, t);
    expect(res.status, body(res)).toBe(200);
    expect(await linkExists(sheet.sheetId, p.id)).toBe(false);
    expect(await ctx.line(sheet.sheetId, c.id, p.id)).toBeNull();
    expect(res.body.itemsUpdatedAt).not.toBe(t);
    expect(res.body.itemsUpdatedAt).toBe(await ctx.tokenOf(sheet.sheetId));
    expect(columns(res)).not.toContain(`product_${p.id}`);
  });

  it('S-106 remove a default product, even if deactivated → 400 "Default products cannot be removed"', async () => {
    const { sheet } = await ctx.world.scene({ products: [] });
    const d = await ctx.world.addProduct({ showByDefault: true });
    await ctx.world.linkProductToSheet(sheet, d);
    for (const deactivate of [false, true]) {
      if (deactivate)
        await ctx.db.master_product.update({
          where: { id: d.id },
          data: { is_active: false },
        });
      const res = await ctx.api.removeProduct(sheet.sheetId, d.id, null);
      expect(res.status, `deactivated=${deactivate}`).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'Default products cannot be removed',
      );
    }
    expect(await linkExists(sheet.sheetId, d.id)).toBe(true);
  });

  it('S-107 remove while some client has ordered qty > 0 → 400 "Set quantities to 0 first"; nothing deleted', async () => {
    const {
      sheet,
      products: [p],
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.seedNight(sheet, [n(c1, p, 3), n(c2, p, 0)]);
    const t = await ctx.tokenOf(sheet.sheetId);
    const res = await ctx.api.removeProduct(sheet.sheetId, p.id, t);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      'Cannot remove a product that already has ordered quantities. Set quantities to 0 first.',
    );
    expect(await linkExists(sheet.sheetId, p.id)).toBe(true);
    expect(await ctx.line(sheet.sheetId, c1.id, p.id)).not.toBeNull();
    expect(await ctx.tokenOf(sheet.sheetId)).toBe(t);
  });

  it('S-108 remove a product with no link and no lines → 400 "Product not found in this sheet"', async () => {
    const { sheet } = await ctx.world.scene({ products: [] });
    const p = await ctx.world.addProduct();
    const res = await ctx.api.removeProduct(sheet.sheetId, p.id, null);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain(
      'Product not found in this sheet',
    );
    expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
  });

  describe('S-109 expectedUpdatedAt on DELETE', () => {
    const del = (sheetId: number, productId: number, query: string) =>
      ctx.call(
        'delete',
        `/orders/sheet/${sheetId}/products/${productId}${query}`,
        ctx.tokens.emp,
      );

    it('missing → 400, empty → 400, unparseable → 400', async () => {
      const {
        sheet,
        products: [p],
      } = await ctx.world.scene();
      for (const q of ['', '?expectedUpdatedAt=', '?expectedUpdatedAt=abc']) {
        const res = await del(sheet.sheetId, p.id, q);
        expect(res.status, q || '(none)').toBe(400);
      }
      expect(await linkExists(sheet.sheetId, p.id)).toBe(true);
    });

    it('literal "null": accepted as the null token on a never-saved sheet, 409 once a token exists', async () => {
      const fresh = await ctx.world.scene();
      const ok = await del(
        fresh.sheet.sheetId,
        fresh.products[0].id,
        '?expectedUpdatedAt=null',
      );
      expect(ok.status, body(ok)).toBe(200);
      expect(await linkExists(fresh.sheet.sheetId, fresh.products[0].id)).toBe(
        false,
      );

      const saved = await ctx.world.scene({ products: [{}, {}] });
      await ctx.seedNight(saved.sheet, [
        n(saved.clients[0], saved.products[0], 1),
      ]);
      const stale = await del(
        saved.sheet.sheetId,
        saved.products[1].id,
        '?expectedUpdatedAt=null',
      );
      expect(stale.status).toBe(409);
      expect(await linkExists(saved.sheet.sheetId, saved.products[1].id)).toBe(
        true,
      );
    });

    it('stale timestamp → 409', async () => {
      const {
        sheet,
        products: [p0, p1],
        clients: [c],
      } = await ctx.world.scene({ products: [{}, {}] });
      await ctx.seedNight(sheet, [n(c, p0, 1)]);
      const res = await del(
        sheet.sheetId,
        p1.id,
        `?expectedUpdatedAt=${encodeURIComponent('2020-01-01T00:00:00.000Z')}`,
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STALE_MESSAGE);
    });
  });

  it('S-110 user A adds / removes; user B holding the old token gets 409 on save, add and remove', async () => {
    const {
      sheet,
      products: [p0],
      clients: [c],
    } = await ctx.world.scene();
    const t0 = await ctx.seedNight(sheet, [n(c, p0, 1)]); // both users load t0
    const extra = await ctx.world.addProduct();
    const a = await ctx.api.addProduct(
      sheet.sheetId,
      extra.id,
      t0,
      ctx.tokens.emp,
    );
    expect(is2xx(a.status), body(a)).toBe(true);

    const save = await ctx.api.night(
      sheet.sheetId,
      [n(c, p0, 5)],
      t0,
      ctx.tokens.emp2,
    );
    expect(save.status).toBe(409);
    expect(save.body.message).toBe(STALE_MESSAGE);
    const add = await ctx.api.addProduct(
      sheet.sheetId,
      (await ctx.world.addProduct()).id,
      t0,
      ctx.tokens.emp2,
    );
    expect(add.status).toBe(409);
    const rem = await ctx.api.removeProduct(
      sheet.sheetId,
      extra.id,
      t0,
      ctx.tokens.emp2,
    );
    expect(rem.status).toBe(409);
    expect(await linkExists(sheet.sheetId, extra.id)).toBe(true);
  });
});
