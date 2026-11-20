/**
 * Dairy Trays: the submission gate (DairyTraysValidationService.validateDairyTraysComplete, called by Paper).
 * Scenarios DY-110 to DY-114 (behavioral spec section C9). The gate is called directly (as the Purchase gate specs
 * do); the Paper-owned rows DY-115 to DY-117 are listed as not implemented in the coverage map.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import { DairyTraysValidationService } from './services/dairy-trays-validation.service.js';
import {
  DT_NO_HEADER,
  DT_NOT_READY,
  addVehicle,
  buyTrays,
  cleanupDtTests,
  dairyRows,
  dtPaper,
  dtRow,
  ledgerScene,
  rebuildLedger,
  seedDairyLine,
  setStoredReturn,
  trayProduct,
  vname,
} from '../../../../test/helper/dairy-trays-helpers.js';

let ctx: OrdersCtx;
beforeAll(async () => {
  ctx = await createOrdersTestContext({ modules: [DairyTraysModule] });
});
afterAll(() => ctx.close());
afterEach(() => cleanupDtTests(ctx));

/** Runs the gate; resolves to null when it passes, otherwise to the 400 response body. */
async function gate(paperId: number) {
  const svc = ctx.app.get(DairyTraysValidationService, { strict: false });
  try {
    await svc.validateDairyTraysComplete(paperId, ctx.prisma);
    return null;
  } catch (e: any) {
    expect(e.getStatus?.(), String(e)).toBe(400);
    const body = e.getResponse();
    return typeof body === 'string' ? { message: body, details: [] } : body;
  }
}

describe('DY-110 to DY-112 the gate passes', () => {
  it('DY-110 and DY-111: header present, every purchase-backed line stored, no return above balance, no negative closing; all returns 0 is valid', async () => {
    const s = await ledgerScene(ctx);
    expect(await gate(s.paperId)).toBeNull();
  });

  it('DY-110 b: a stored return within the balance passes', async () => {
    const s = await ledgerScene(ctx);
    await setStoredReturn(ctx, s.paperId, s.v, s.trayTypeId, 10);
    expect(await gate(s.paperId)).toBeNull();
  });

  it('DY-112: a carry-forward line that is not stored yet passes (it is live until stored)', async () => {
    const a = await ledgerScene(ctx, { k: 0, qty: 10 });
    const later = await dtPaper(ctx, 1);
    expect(await dairyRows(ctx, later.paperId)).toEqual([]);
    expect(await gate(later.paperId)).toBeNull();
    void a;
  });
});

describe('DY-113 the gate reports every problem at once', () => {
  it('DY-113 a: a missing header is 400 with the "has not been generated" text', async () => {
    const sheet = await dtPaper(ctx, 0, 'NIGHT_SUBMITTED', { header: false });
    const out = await gate(sheet.paperId);
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).toContain(DT_NO_HEADER);
  });

  it('DY-113 b: a purchase-backed line with no stored row is listed as missing', async () => {
    const s = await ledgerScene(ctx);
    await ctx.db.dairy_tray_transaction.deleteMany({
      where: {
        dairy_tray_paper_id: (
          await ctx.db.dairy_tray_paper.findUniqueOrThrow({
            where: { order_paper_id: s.paperId },
          })
        ).id,
      },
    });
    const out = await gate(s.paperId);
    expect(out!.message).toBe(DT_NOT_READY);
    expect(out!.details.join('\n')).toContain(
      `Missing dairy tray entry for vehicle "${vname(s.v)}" (NIGHT)`,
    );
  });

  it('DY-113 c: a stored return above its balance is listed', async () => {
    const s = await ledgerScene(ctx);
    await setStoredReturn(ctx, s.paperId, s.v, s.trayTypeId, 15);
    const out = await gate(s.paperId);
    expect(out!.message).toBe(DT_NOT_READY);
    expect(out!.details.join('\n')).toContain(
      'exceeds the outstanding balance of 10',
    );
  });

  it('DY-113 d: a negative closing (legacy negative opening) is listed', async () => {
    const a = await dtPaper(ctx, 0);
    const tp = await trayProduct(ctx);
    const v = await addVehicle(ctx);
    await seedDairyLine(ctx, a.paperId, v, tp.trayTypeId, {
      opening: 0,
      taken: 0,
      returned: 5,
    });
    const later = await dtPaper(ctx, 1);
    const out = await gate(later.paperId);
    expect(out!.message).toBe(DT_NOT_READY);
    expect(out!.details.join('\n')).toContain('would close at -5');
  });

  it('DY-113 e: several problems in one paper come back together in one response', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 4);
    await rebuildLedger(ctx, s.paperId);
    await setStoredReturn(ctx, s.paperId, s.v, s.trayTypeId, 15); // above balance
    await ctx.db.dairy_tray_transaction.deleteMany({
      where: { id: (await dtRow(ctx, s.paperId, v2, s.trayTypeId))!.id }, // missing row
    });
    const out = await gate(s.paperId);
    expect(out!.message).toBe(DT_NOT_READY);
    expect(out!.details).toHaveLength(2);
  });
});

describe('DY-114 live values, no waiting', () => {
  it('DY-114: a pending background job does not matter; stored opening/taken/closing are not compared with the live values', async () => {
    const s = await ledgerScene(ctx);
    await ctx.db.propagation_outbox.create({
      data: {
        type: 'DAIRY_TRAYS_FORWARD',
        paper_id: s.paperId,
        status: 'PENDING',
      },
    });
    const row = (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!;
    await ctx.db.dairy_tray_transaction.update({
      where: { id: row.id },
      data: { opening_balance: 999, closing_balance: 1009 },
    });
    expect(await gate(s.paperId)).toBeNull();
  });
});
