/**
 * Orders – night save: validation, token, business rules, pricing.
 * Scenarios: S-30 .. S-48, S-50 .. S-73, S-147
 * (spec: OD-5, OD-6, OD-8, OD-9, OD-10, OD-12, CT-6.4, CT-6.6)
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
import { OrderCommercialService } from './services/order-commercial.service.js';
import {
  createOrdersTestContext,
  iso,
  n,
  num,
  STALE_MESSAGE,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';

describe('Orders night save', () => {
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

  // ------------------------------------------------------------------ C3
  describe('validation and token', () => {
    it('S-30 first save with explicit null token → 200 with new token, line created', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null);
      expect(res.status, body(res)).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Night entries saved successfully',
      });
      expect(typeof res.body.itemsUpdatedAt).toBe('string');
      expect(await ctx.tokenOf(sheet.sheetId)).toBe(res.body.itemsUpdatedAt);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
      ).toBe(2);
    });

    it('S-31 omitted expectedUpdatedAt → 400 on all four mutating endpoints', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const base = `/orders/sheet/${sheet.sheetId}`;
      const t = ctx.tokens.emp;
      const results = [
        await ctx.call('post', `${base}/night-save`, t, {
          entries: [n(c, p, 1)],
        }),
        await ctx.call('post', `${base}/morning-save`, t, {
          entries: [{ clientId: c.id, productId: p.id, deliveredQty: 1 }],
        }),
        await ctx.call('post', `${base}/products`, t, { productId: p.id }),
        await ctx.call('delete', `${base}/products/${p.id}`, t),
      ];
      results.forEach((r, i) => expect(r.status, `endpoint #${i}`).toBe(400));
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-32 token already set, explicit null → 409 stale', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STALE_MESSAGE);
    });

    it('S-33 malformed token → 400 "Invalid expectedUpdatedAt"', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], 'abc');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'Invalid expectedUpdatedAt',
      );
    });

    it('S-34 loose ISO token (date-only) that differs → 409; non-date string → 400', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      expect(
        (await ctx.api.night(sheet.sheetId, [n(c, p, 2)], '2020-01-01')).status,
      ).toBe(409);
      expect(
        (await ctx.api.night(sheet.sheetId, [n(c, p, 2)], 'not-a-date')).status,
      ).toBe(400);
    });

    it('S-35 entries [] or > 5000 → 400', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      expect((await ctx.api.night(sheet.sheetId, [], null)).status).toBe(400);
      const many = Array.from({ length: 5001 }, () => ({
        clientId: c.id,
        productId: p.id,
      }));
      expect((await ctx.api.night(sheet.sheetId, many, null)).status).toBe(400);
    });

    it('S-36 quantities 5, 5.5, 5.25, 5.00 are accepted and stored as given', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      for (const q of [5, 5.5, 5.25, 5.0]) {
        const res = await ctx.api.night(
          sheet.sheetId,
          [n(c, p, q)],
          await ctx.tokenOf(sheet.sheetId),
        );
        expect(res.status, `qty ${q}: ${body(res)}`).toBe(200);
        expect(
          num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
        ).toBe(q);
      }
    });

    it('S-37 5.255 → 400 "at most 2 decimal places", never rounded', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 5.255)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'at most 2 decimal places',
      );
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-38 10000 is accepted', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 10000)], null);
      expect(res.status, body(res)).toBe(200);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
      ).toBe(10000);
    });

    it('S-39 10000.01 and string "5" → 400', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      expect(
        (await ctx.api.night(sheet.sheetId, [n(c, p, 10000.01)], null)).status,
      ).toBe(400);
      expect(
        (await ctx.api.night(sheet.sheetId, [n(c, p, '5')], null)).status,
      ).toBe(400);
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-40 negative quantity → 400 (only the status is binding, OD-5.3)', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, -1)], null);
      expect(res.status).toBe(400);
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-41 same (client, product) twice with explicit qty → 400 duplicate', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(
        sheet.sheetId,
        [n(c, p, 1), n(c, p, 2)],
        null,
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'Duplicate entries found',
      );
    });

    it('S-42 same pair once blank and once explicit is accepted', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(
        sheet.sheetId,
        [n(c, p, undefined), n(c, p, 2)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
      ).toBe(2);
    });

    it('S-43 all entries blank / null / "" → 200, token unchanged, no writes, no tray recalculation', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene({ products: [{ tray: true }] });
      const blanks = [
        { clientId: c.id, productId: p.id },
        n(c, p, null),
        n(c, p, ''),
      ];
      const r1 = await ctx.api.night(sheet.sheetId, blanks, null);
      expect(r1.status, body(r1)).toBe(200);
      expect(r1.body.itemsUpdatedAt).toBeNull();
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
      expect(await ctx.trayRows(sheet.sheetId)).toHaveLength(0);

      const t1 = await ctx.seedNight(sheet, [n(c, p, 2)]);
      const r2 = await ctx.api.night(sheet.sheetId, blanks, t1);
      expect(r2.status).toBe(200);
      expect(r2.body.itemsUpdatedAt).toBe(t1);
      expect(await ctx.tokenOf(sheet.sheetId)).toBe(t1);
    });

    it('S-44 explicit 0 for a pair with no line → 200, token unchanged, nothing created', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 0)], null);
      expect(res.status, body(res)).toBe(200);
      expect(res.body.itemsUpdatedAt).toBeNull();
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-45 explicit 0 for a nonexistent client / product → 400 not found', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const noClient = await ctx.api.night(
        sheet.sheetId,
        [{ clientId: 2000000000, productId: p.id, orderedQty: 0 }],
        null,
      );
      expect(noClient.status).toBe(400);
      expect(JSON.stringify(noClient.body.message)).toContain(
        'Client with ID 2000000000 not found',
      );
      const noProduct = await ctx.api.night(
        sheet.sheetId,
        [{ clientId: c.id, productId: 2000000000, orderedQty: 0 }],
        null,
      );
      expect(noProduct.status).toBe(400);
      expect(JSON.stringify(noProduct.body.message)).toContain(
        'Product with ID 2000000000 not found',
      );
    });

    it('S-46 stale token with an otherwise no-op payload → 409', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      const t1 = await ctx.seedNight(sheet, [n(c, p, 1)]);
      await ctx.seedNight(sheet, [n(c, p, 2)]); // advances the token
      const res = await ctx.api.night(
        sheet.sheetId,
        [{ clientId: c.id, productId: p.id }],
        t1,
      );
      expect(res.status).toBe(409);
    });

    it('S-47 paper not DRAFT → 400 with status text', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      for (const status of [
        'NIGHT_SUBMITTED',
        'MORNING_SUBMITTED',
        'FINALIZED',
        'REOPENED',
      ] as const) {
        await ctx.setStatus(sheet, status);
        const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
        expect(res.status, status).toBe(400);
        expect(res.body.message).toBe(
          `Cannot edit night entries when paper is ${status}. Allowed status: DRAFT`,
        );
      }
    });

    it('S-48 pre-transaction precision error wins over a stale token', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      const res = await ctx.api.night(
        sheet.sheetId,
        [n(c, p, 5.255)],
        '2020-01-01T00:00:00.000Z',
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'at most 2 decimal places',
      );
    });
  });

  // ------------------------------------------------------------------ C4
  describe('business rules', () => {
    it('S-50 valid new line: frozen config, night rate/bill, tray ledger, token advanced once', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({ products: [{ tray: true }] });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 2)], null);
      expect(res.status, body(res)).toBe(200);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(l).toMatchObject({
        product_link_id: p.links[world.distA.id],
        tray_type_id: world.brandTray.trayTypeId,
        units_per_order_unit: 12,
        pricing_unit: 'L',
        resolved_via_fallback: false,
        owner_distributor_id: world.distA.id,
      });
      expect(num(l.pricing_quantity)).toBe(12);
      expect(num(l.night_selling_rate)).toBe(56);
      expect(num(l.night_bill_amount)).toBe(1344);
      const tray = await ctx.trayRows(sheet.sheetId);
      expect(tray).toHaveLength(1);
      expect(tray[0]).toMatchObject({
        opening_balance: 0,
        trays_taken: 2,
        closing_balance: 2,
      });
      expect(await ctx.tokenOf(sheet.sheetId)).toBe(res.body.itemsUpdatedAt);
    });

    it('S-51a new line for an inactive client → 400, nothing saved', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      await ctx.db.master_client.update({
        where: { id: c.id },
        data: { is_active: false },
      });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(
        `Client "${c.name}" is inactive and cannot be ordered`,
      );
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
      expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
    });

    it('S-51b new line for a client of another group → 400', async () => {
      const {
        sheet,
        products: [p],
        group,
      } = await ctx.world.scene();
      const other = await ctx.world.addGroup();
      const foreign = await ctx.world.addClient({ group: other });
      const res = await ctx.api.night(sheet.sheetId, [n(foreign, p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        `Client ${foreign.id} does not belong to group ${group.id}`,
      );
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-51c new line for a client not authorized for the category → 400', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        clientOpts: {
          categories: [
            { category: 'NON_MILK' as never, supplier: world.distA },
          ],
        },
      });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain(
        `Client "${c.name}" is not authorized to purchase MILK products`,
      );
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
    });

    it('S-52a new line for an inactive product → 400', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene({ products: [{ active: false }] });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        `Product ${p.id} is inactive`,
      );
    });

    it('S-52b product not default, not added, no line anywhere → 400 "not available on this sheet"', async () => {
      const {
        sheet,
        clients: [c],
      } = await ctx.world.scene({ products: [] });
      const p = await ctx.world.addProduct();
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        `Product ${p.id} is not available on this sheet. Add it to the sheet before ordering it.`,
      );
    });

    it('S-52c a line for ANY client makes the product available for every eligible client (OD-6.6c)', async () => {
      const {
        sheet,
        products: [p],
        clients: [c1, c2],
      } = await ctx.world.scene({ clients: 2 });
      await ctx.seedNight(sheet, [n(c1, p, 1)]);
      await ctx.db.order_sheet_product.deleteMany({
        where: { order_sheet_id: sheet.sheetId },
      });
      const res = await ctx.api.night(
        sheet.sheetId,
        [n(c2, p, 1)],
        await ctx.tokenOf(sheet.sheetId),
      );
      expect(res.status, body(res)).toBe(200);
    });

    it('S-53 [service seam] client without a category record → "Missing MILK supplier for client X"', async () => {
      // Not reachable through the API (the category-authorization check fires first, OD-8.7),
      // so the resolver is exercised directly.
      const {
        group,
        products: [p],
      } = await ctx.world.scene();
      const c = await ctx.world.addClient({ group, categories: [] });
      const svc = ctx.app.get(OrderCommercialService, { strict: false });
      await expect(
        svc.resolveBatch(
          [{ clientId: c.id, productId: p.id }],
          group.id,
          ctx.prisma as never,
        ),
      ).rejects.toThrow(`Missing MILK supplier for client ${c.id}`);
    });

    it('S-54 primary allowed with an active link → primary chosen, no fallback flag', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene();
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(l.product_link_id).toBe(p.links[world.distA.id]);
      expect(l.resolved_via_fallback).toBe(false);
    });

    it('S-55a primary has no active link; listed fallback chosen, flag true, warning logged', async () => {
      const { world } = ctx;
      const {
        group,
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [
          {
            distributors: [
              { dist: world.distA, rate: 56, linkActive: false },
              { dist: world.distB, rate: 50 },
            ],
          },
        ],
      });
      await world.addPriority(group, p, world.distB, 1);
      const warn = vi.spyOn(Logger.prototype, 'warn');
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(l.product_link_id).toBe(p.links[world.distB.id]);
      expect(l.resolved_via_fallback).toBe(true);
      expect(num(l.night_selling_rate)).toBe(50);
      expect(
        warn.mock.calls.some((a) => String(a[0]).includes('falling back')),
      ).toBe(true);
    });

    it('S-55b inactive primary distributor is skipped; fallback chosen', async () => {
      const { world } = ctx;
      const distP = await world.addDistributor({ active: false });
      const {
        group,
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [
          {
            distributors: [
              { dist: distP, rate: 56 },
              { dist: world.distB, rate: 50 },
            ],
          },
        ],
        clientOpts: {
          categories: [
            { category: 'MILK' as never, supplier: distP },
            { category: 'NON_MILK' as never, supplier: distP },
          ],
        },
      });
      await world.addPriority(group, p, world.distB, 1);
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(l.product_link_id).toBe(p.links[world.distB.id]);
      expect(l.resolved_via_fallback).toBe(true);
    });

    it('S-55c primary not in the procurement rules is skipped; fallback chosen', async () => {
      const { world } = ctx;
      const distX = await world.addDistributor({ rulesFor: [] });
      const {
        group,
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [
          {
            distributors: [
              { dist: distX, rate: 56 },
              { dist: world.distB, rate: 50 },
            ],
          },
        ],
        clientOpts: {
          categories: [
            { category: 'MILK' as never, supplier: distX },
            { category: 'NON_MILK' as never, supplier: distX },
          ],
        },
      });
      await world.addPriority(group, p, world.distB, 1);
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(l.product_link_id).toBe(p.links[world.distB.id]);
      expect(l.resolved_via_fallback).toBe(true);
    });

    it('S-56a no procurement rule for the product → "No eligible distributor found"', async () => {
      const bare = await ctx.world.addBrand({ rules: false });
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene({ products: [{ brand: bare }] });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        `No eligible distributor found for product ${p.id}`,
      );
    });

    it('S-56b primary not allowed and no fallback → "No eligible supplier (primary or fallback)"', async () => {
      const { world } = ctx;
      const distX = await world.addDistributor({ rulesFor: [] });
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [{ distributors: [{ dist: distX }] }],
        clientOpts: {
          categories: [{ category: 'MILK' as never, supplier: distX }],
        },
      });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'No eligible supplier (primary or fallback) can supply product',
      );
    });

    it('S-56c eligible candidates but no active link → "No product link found"', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene({ products: [{ distributors: [] }] });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'No product link found for any eligible distributor',
      );
    });

    it('S-57 / S-147 primary and a fallback both at priority 0 → primary chosen every time', async () => {
      const { world } = ctx;
      const {
        group,
        sheet,
        products: [p],
        clients,
      } = await world.scene({
        clients: 3,
        products: [
          {
            distributors: [
              { dist: world.distA, rate: 56 },
              { dist: world.distB, rate: 50 },
            ],
          },
        ],
      });
      await world.addPriority(group, p, world.distB, 0);
      await ctx.seedNight(
        sheet,
        clients.map((c) => n(c, p, 1)),
      );
      for (const c of clients) {
        const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
        expect(l.product_link_id).toBe(p.links[world.distA.id]);
        expect(l.resolved_via_fallback).toBe(false);
      }
    });

    it('S-58 no applicable rate → 400, whole request fails, nothing saved', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [pOk, pNoRate],
        clients: [c],
      } = await world.scene({
        products: [{}, { distributors: [{ dist: world.distA, rate: null }] }],
      });
      const res = await ctx.api.night(
        sheet.sheetId,
        [n(c, pOk, 1), n(c, pNoRate, 1)],
        null,
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        `No active rate found for product ${pNoRate.id} on date ${iso(sheet.saleDate)}`,
      );
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
      expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
    });

    it('S-59 client rate beats distributor rate; latest effective_from wins among client rates', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene();
      const link = p.links[world.distA.id];
      await world.addClientRate(c, link, 60, new Date('2001-01-01T00:00:00Z'));
      await ctx.seedNight(sheet, [n(c, p, 1)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_selling_rate),
      ).toBe(60);
      await world.addClientRate(c, link, 65, new Date('2002-01-01T00:00:00Z'));
      await ctx.seedNight(sheet, [n(c, p, 2)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_selling_rate),
      ).toBe(65);
    });

    // Sale date 11 Oct 2092; rates are read as Asia/Kolkata calendar dates (OD-9.1)
    it.each([
      [
        'S-60 effective-from 11 Oct 10:00 IST is valid',
        { from: '2092-10-11T10:00:00+05:30' },
        true,
      ],
      [
        'S-61a effective-from 12 Oct 00:30 IST is not valid',
        { from: '2092-10-12T00:30:00+05:30' },
        false,
      ],
      [
        'S-61b effective-to 10 Oct 23:59 IST is not valid',
        { to: '2092-10-10T23:59:00+05:30' },
        false,
      ],
      [
        'S-62 effective-to 11 Oct 00:00 IST is valid',
        { to: '2092-10-11T00:00:00+05:30' },
        true,
      ],
    ] as const)('%s', async (_name, range, valid) => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [{ distributors: [{ dist: world.distA, rate: null }] }],
        saleDate: new Date(Date.UTC(2092, 9, 11)),
      });
      await world.addDistRate(p.links[world.distA.id], 56, {
        from: new Date('from' in range ? range.from : '2000-01-01T00:00:00Z'),
        to: 'to' in range ? new Date(range.to) : null,
      });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 1)], null);
      if (valid) {
        expect(res.status, body(res)).toBe(200);
      } else {
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body.message)).toContain(
          'No active rate found',
        );
      }
    });

    it('S-63 GST-exclusive: qty 10, rate 100, 18% → night bill 1180', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [
          {
            gst: 18,
            inclusive: false,
            units: 1,
            pricingQty: 1,
            distributors: [{ dist: world.distA, rate: 100 }],
          },
        ],
      });
      await ctx.seedNight(sheet, [n(c, p, 10)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_bill_amount),
      ).toBe(1180);
    });

    it('S-64 GST-inclusive: qty 10, rate 118, 18% → night bill 1180', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [
          {
            gst: 18,
            inclusive: true,
            units: 1,
            pricingQty: 1,
            distributors: [{ dist: world.distA, rate: 118 }],
          },
        ],
      });
      await ctx.seedNight(sheet, [n(c, p, 10)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_bill_amount),
      ).toBe(1180);
    });

    it('S-65 pricing quantity 12, Rs 56/L, 10 crates, 0% GST → Rs 6,720', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      await ctx.seedNight(sheet, [n(c, p, 10)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_bill_amount),
      ).toBe(6720);
    });

    it('S-66 night GST is not frozen: product GST change applies on the next night save', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({
        products: [
          {
            units: 1,
            pricingQty: 1,
            distributors: [{ dist: world.distA, rate: 100 }],
          },
        ],
      });
      await ctx.seedNight(sheet, [n(c, p, 10)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_bill_amount),
      ).toBe(1000);
      await ctx.db.master_product.update({
        where: { id: p.id },
        data: { gst_percentage: 18 },
      });
      await ctx.seedNight(sheet, [n(c, p, 10)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.night_bill_amount),
      ).toBe(1180);
    });

    it('S-67 existing line: qty/rate/bill update, frozen fields stay after master-data changes', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({ products: [{ tray: true }] });
      await ctx.seedNight(sheet, [n(c, p, 2)]);
      const before = (await ctx.line(sheet.sheetId, c.id, p.id))!;

      await ctx.db.master_client.update({
        where: { id: c.id },
        data: { owner_distributor_id: world.distB.id },
      });
      await ctx.db.master_client_category.updateMany({
        where: { client_id: c.id },
        data: { supplier_distributor_id: world.distB.id },
      });
      const prod = await ctx.db.master_product.findUniqueOrThrow({
        where: { id: p.id },
      });
      await ctx.db.product_order_unit.update({
        where: { id: prod.product_order_unit_id },
        data: { units_per_order_unit: 24 },
      });
      await world.setDistRate(p.links[world.distA.id], 60);

      await ctx.seedNight(sheet, [n(c, p, 3)]);
      const after = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(num(after.ordered_qty)).toBe(3);
      expect(num(after.night_selling_rate)).toBe(60);
      expect(num(after.night_bill_amount)).toBe(2160);
      expect(after.product_link_id).toBe(before.product_link_id);
      expect(after.tray_type_id).toBe(before.tray_type_id);
      expect(after.units_per_order_unit).toBe(12);
      expect(num(after.pricing_quantity)).toBe(12);
      expect(after.owner_distributor_id).toBe(world.distA.id);
      expect(after.resolved_via_fallback).toBe(before.resolved_via_fallback);
    });

    it('S-68 existing line of a deactivated client/product stays editable and cancellable; positive qty still needs a rate', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene();
      await ctx.seedNight(sheet, [n(c, p, 2)]);
      await ctx.db.master_client.update({
        where: { id: c.id },
        data: { is_active: false },
      });
      await ctx.db.master_product.update({
        where: { id: p.id },
        data: { is_active: false },
      });

      await ctx.seedNight(sheet, [n(c, p, 3)]);
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
      ).toBe(3);

      await world.deleteRates(p);
      const noRate = await ctx.api.night(
        sheet.sheetId,
        [n(c, p, 4)],
        await ctx.tokenOf(sheet.sheetId),
      );
      expect(noRate.status).toBe(400);
      expect(JSON.stringify(noRate.body.message)).toContain(
        'No active rate found',
      );

      await ctx.seedNight(sheet, [n(c, p, 0)]); // cancellation never needs a rate
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
      ).toBe(0);
    });

    it('S-69 explicit 0 on an existing line cancels it without a rate lookup (OD-6.10)', async () => {
      const { world } = ctx;
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await world.scene({ products: [{ tray: true }] });
      await ctx.seedNight(sheet, [n(c, p, 2)]);
      expect(await ctx.trayRows(sheet.sheetId)).toHaveLength(1);
      await ctx.db.master_product.update({
        where: { id: p.id },
        data: { gst_percentage: 5, is_gst_inclusive: true },
      });
      await world.deleteRates(p); // proves no lookup happens

      await ctx.seedNight(sheet, [n(c, p, 0)]);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(num(l.ordered_qty)).toBe(0);
      expect(num(l.night_bill_amount)).toBe(0);
      expect(num(l.night_selling_rate)).toBe(56); // stored night rate untouched
      expect(num(l.delivered_qty)).toBe(0);
      expect(num(l.final_taxable_amount)).toBe(0);
      expect(num(l.final_gst_amount)).toBe(0);
      expect(num(l.final_bill_amount)).toBe(0);
      expect(num(l.final_selling_rate)).toBe(56); // = stored night rate
      expect(num(l.final_gst_percentage)).toBe(5); // product's CURRENT values
      expect(l.final_gst_inclusive).toBe(true);
      expect(await ctx.trayRows(sheet.sheetId)).toHaveLength(0); // ledger recalculated
    });

    it('S-70 raising a zeroed line above 0 clears delivered and every final field', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene();
      await ctx.seedNight(sheet, [n(c, p, 2)]);
      await ctx.seedNight(sheet, [n(c, p, 0)]);
      await ctx.seedNight(sheet, [n(c, p, 3)]);
      const l = (await ctx.line(sheet.sheetId, c.id, p.id))!;
      expect(num(l.ordered_qty)).toBe(3);
      expect(num(l.night_selling_rate)).toBe(56);
      expect(num(l.night_bill_amount)).toBe(2016);
      for (const f of [
        'delivered_qty',
        'final_selling_rate',
        'final_gst_percentage',
        'final_gst_amount',
        'final_taxable_amount',
        'final_bill_amount',
        'final_gst_inclusive',
      ] as const) {
        expect(l[f], f).toBeNull();
      }
    });

    it('S-71 one bad entry among 50 fails the whole request; token and ledger are rolled back', async () => {
      const { world } = ctx;
      const { sheet, products, clients } = await world.scene({
        products: Array.from({ length: 7 }, () => ({ tray: true })),
        clients: 7,
      });
      const noRate = await world.addProduct({
        tray: true,
        distributors: [{ dist: world.distA, rate: null }],
      });
      await world.linkProductToSheet(sheet, noRate);
      const entries = clients.flatMap((c) => products.map((p) => n(c, p, 1)));
      entries.push(n(clients[0], noRate, 1)); // fails inside the transaction, after the token was touched
      expect(entries).toHaveLength(50);
      const res = await ctx.api.night(sheet.sheetId, entries, null);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'No active rate found',
      );
      expect(await ctx.lines(sheet.sheetId)).toHaveLength(0);
      expect(await ctx.tokenOf(sheet.sheetId)).toBeNull();
      expect(await ctx.trayRows(sheet.sheetId)).toHaveLength(0);
    });

    it('S-72 save that would leave a stored tray return above its balance → 409 with details, nothing saved', async () => {
      const {
        sheet,
        products: [p],
        clients: [c],
      } = await ctx.world.scene({ products: [{ tray: true }] });
      const t1 = await ctx.seedNight(sheet, [n(c, p, 5)]);
      // stored return of 5 (legacy / seam: employees can only enter it after night submit)
      await ctx.db.client_tray_transaction.updateMany({
        where: { order_sheet_id: sheet.sheetId },
        data: { trays_returned: 5, closing_balance: 0 },
      });
      const res = await ctx.api.night(sheet.sheetId, [n(c, p, 3)], t1);
      expect(res.status, body(res)).toBe(409);
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details[0]).toContain('returned but only 3 outstanding');
      expect(
        num((await ctx.line(sheet.sheetId, c.id, p.id))!.ordered_qty),
      ).toBe(5);
      expect(await ctx.tokenOf(sheet.sheetId)).toBe(t1);
    });

    it('S-73 three lines of 0.4 crates for one client and tray type → 1 tray (sum, then round once)', async () => {
      const {
        sheet,
        products,
        clients: [c],
      } = await ctx.world.scene({
        products: [{ tray: true }, { tray: true }, { tray: true }],
      });
      await ctx.seedNight(
        sheet,
        products.map((p) => n(c, p, 0.4)),
      );
      const tray = await ctx.trayRows(sheet.sheetId);
      expect(tray).toHaveLength(1);
      expect(tray[0]).toMatchObject({ trays_taken: 1, closing_balance: 1 });
    });
  });
});
