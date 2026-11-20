/**
 * Client Trays – interaction with the Paper module.
 * Scenarios: T-83, T-108   (spec: CT-12.1 .. 12.3, PA-6.3, PA-11.1, I-3)
 *
 * REQUIRES the one-line harness change in test/helper/orders-harness.modules.patch
 * (createOrdersTestContext({ modules: [...] })), because the stock harness mounts only Auth + Orders.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  m,
  n,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { PaperModule } from '../paper/paper.module.js';
import {
  cleanupTrayTests,
  ret,
  submittedWithTrays,
  traysApi,
  trayToken,
  tt,
} from '../../../../test/helper/client-trays-helpers.js';

describe('Client Trays and the Paper module', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({ modules: [PaperModule] });
    api = traysApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  const readiness = async (paperId: number) => {
    const res = await ctx.call(
      'get',
      `/papers/${paperId}/readiness`,
      ctx.tokens.emp,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as {
      action: string | null;
      problems: string[];
      warnings: string[];
    };
  };
  const status = async (paperId: number) =>
    (await ctx.db.order_paper.findUniqueOrThrow({ where: { id: paperId } }))
      .status;

  it('T-83 night submit, morning submit and re-finalize call no Client Trays gate (readiness lists no tray problem)', async () => {
    // The real submits also need Vehicle Allocation, Purchase, Dairy Trays and Cash Settlement to be ready
    // (see T-108 note). Readiness runs the very same collectors (PA-19.3), without committing anything.
    const trayProblem = /Tray (returns incomplete|calculation failed)/i;

    const noTray = await ctx.world.scene({ products: [{}], clients: 1 });
    await ctx.seedNight(noTray.sheet, [
      n(noTray.clients[0], noTray.products[0], 3),
    ]);
    expect(await ctx.trayRows(noTray.sheet.sheetId)).toHaveLength(0); // a sheet may legitimately have no ledger line (PA-6.3)
    const draft = await readiness(noTray.sheet.paperId);
    expect(draft.action).toBe('SUBMIT_NIGHT');
    expect(draft.problems.filter((p) => trayProblem.test(p))).toEqual([]);

    const s = await submittedWithTrays(ctx, { qty: 5 }); // NIGHT_SUBMITTED, return never entered
    const night = await readiness(s.sheet.paperId);
    expect(night.action).toBe('SUBMIT_MORNING');
    expect(night.problems.filter((p) => trayProblem.test(p))).toEqual([]);

    await ctx.seedMorning(s.sheet, [m(s.clients[0], s.products[0], 5)]);
    await ctx.setStatus(s.sheet, 'REOPENED');
    const fin = await readiness(s.sheet.paperId);
    expect(fin.action).toBe('FINALIZE');
    expect(fin.problems.filter((p) => trayProblem.test(p))).toEqual([]);
  });

  it('T-108 [adapted] a tray save racing a Paper status change: one wins, the loser gets 400 (status), never a 5xx or a half-write', async () => {
    // A tray save racing a real morning submit / finalize would need a paper that passes every module's
    // readiness checks (not buildable from this harness without those modules' rules). The same
    // property (PA-11.1: status check + serializable transaction) is exercised with the one transition that
    // needs no readiness: the admin revert MORNING_SUBMITTED -> NIGHT_SUBMITTED, which turns saving ON.
    for (let i = 0; i < 4; i++) {
      const s = await submittedWithTrays(ctx, { qty: 5 });
      const [c] = s.clients;
      await ctx.setStatus(s.sheet, 'MORNING_SUBMITTED');

      const [save, revert] = await Promise.all([
        api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], null),
        ctx.call(
          'post',
          `/papers/${s.sheet.paperId}/revert-morning`,
          ctx.tokens.admin,
          { reason: `T-108 race ${i}` },
        ),
      ]);
      const msg = JSON.stringify(save.body);
      expect(revert.status, JSON.stringify(revert.body)).toBe(201);
      expect([200, 400], `run ${i}: ${msg}`).toContain(save.status);
      expect(await status(s.sheet.paperId)).toBe('NIGHT_SUBMITTED');

      const row = (await ctx.trayRows(s.sheet.sheetId))[0];
      if (save.status === 200) {
        expect(row.trays_returned).toBe(2);
        expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
          save.body.clientTraysUpdatedAt,
        );
      } else {
        expect(save.body.message).toBe(
          'Tray cannot be edited in the current workflow state',
        );
        expect(row.trays_returned).toBe(0);
        expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
      }
    }
  }, 60000);
});
