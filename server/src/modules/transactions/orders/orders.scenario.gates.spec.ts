/**
 * Orders – submission gates owned by the Orders module.
 * Scenarios: S-130 .. S-134   (spec: OD-13.1 .. 13.4)
 *
 * The gates are not HTTP endpoints of Orders; Paper calls them on submit. They are exercised
 * through OrdersValidationService against the real test database. The Paper-level exemptions
 * (no-operation / inactive group, PA-6.5, PA-7.5) belong to the Paper module and are not covered here.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OrdersValidationService } from './services/orders-validation.service.js';
import {
  createOrdersTestContext,
  m,
  n,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';

describe('Orders submission gates', () => {
  let ctx: OrdersCtx;
  let gates: OrdersValidationService;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    gates = ctx.app.get(OrdersValidationService, { strict: false });
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  const db = () => ctx.prisma as never;
  const noOrders = (name: string) =>
    `No orders entered for sheet "${name}". Please enter at least one order before submitting.`;
  const noLines = (name: string) =>
    `No order lines exist for sheet "${name}". A sheet with no orders cannot be submitted.`;

  it('S-130 night gate: at least one line with ordered qty > 0 passes', async () => {
    const {
      sheet,
      group,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 2)]);
    await expect(
      gates.validateNightEntriesComplete(sheet.sheetId, group.name, db()),
    ).resolves.toBeUndefined();
  });

  it('S-131 night gate: no lines, or only zeroed lines → 400 "No orders entered for sheet …"', async () => {
    const {
      sheet,
      group,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await expect(
      gates.validateNightEntriesComplete(sheet.sheetId, group.name, db()),
    ).rejects.toMatchObject({
      status: 400,
      message: noOrders(group.name),
    });
    await ctx.seedNight(sheet, [n(c, p, 2)]);
    await ctx.seedNight(sheet, [n(c, p, 0)]);
    await expect(
      gates.validateNightEntriesComplete(sheet.sheetId, group.name, db()),
    ).rejects.toMatchObject({
      status: 400,
      message: noOrders(group.name),
    });
  });

  it('S-132 morning gate: a sheet with no lines → 400 "No order lines exist for sheet …"', async () => {
    const { sheet, group } = await ctx.world.scene();
    await expect(
      gates.validateMorningEntriesComplete(sheet.sheetId, db()),
    ).rejects.toMatchObject({
      status: 400,
      message: noLines(group.name),
    });
  });

  it('S-133 morning gate: a line with null delivered → 400 "Delivered quantity missing for: <codes>"; passes once delivered', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 2)]);
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await expect(
      gates.validateMorningEntriesComplete(sheet.sheetId, db()),
    ).rejects.toMatchObject({
      status: 400,
      message: `Delivered quantity missing for: ${p.code}`,
    });
    await ctx.seedMorning(sheet, [m(c, p, 2)]);
    await expect(
      gates.validateMorningEntriesComplete(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
  });

  it('S-134 [DB seam] a stored negative delivered qty → "Negative quantities not allowed: <codes>" (not reachable via the API)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 2)]);
    await ctx.db.order_sheet_items.updateMany({
      where: { order_sheet_id: sheet.sheetId },
      data: { delivered_qty: -1 },
    });
    await expect(
      gates.validateQuantitySanity(sheet.sheetId, db()),
    ).rejects.toMatchObject({
      status: 400,
      message: `Negative quantities not allowed: ${p.code}`,
    });
  });
});
