/**
 * Vehicle Allocation and the Paper module.
 * Scenarios: V-128, V-129, V-143   (spec: PA-19.3, PA-8.3, PA-11.1, VA-2.3, I-3)
 *
 * Needs the harness `modules` option (createOrdersTestContext({ modules: [...] })), as in the Client Trays paper spec.
 * V-143 is ADAPTED: a save racing a real night submit needs a paper that passes every module's readiness. The same
 * property (PA-11.1: status check + serializable transaction) is exercised with the admin revert
 * MORNING_SUBMITTED -> NIGHT_SUBMITTED, which turns MORNING allocation editing ON.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  num,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { PaperModule } from '../paper/paper.module.js';
import {
  addVehicle,
  al,
  cleanupVaTests,
  demandScene,
  setSheetSession,
  vaApi,
  vaPaper,
  vaRows,
  vaToken,
} from '../../../../test/helper/vehicle-allocation-helpers.js';

describe('Vehicle Allocation and the Paper module', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof vaApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext({ modules: [PaperModule] });
    api = vaApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupVaTests(ctx));

  const readiness = async (paperId: number) => {
    const res = await ctx.call(
      'get',
      `/papers/${paperId}/readiness`,
      ctx.tokens.emp,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as { action: string | null; problems: string[] };
  };
  const COVERAGE = /required [\d.]+, allocated [\d.]+/;

  it('V-128 readiness lists the same Vehicle Allocation problems as the real gate and writes nothing', async () => {
    const s = await demandScene(ctx, { qty: 10 });
    const v = await addVehicle(ctx);
    const r = await readiness(s.paperId);
    expect(r.action).toBe('SUBMIT_NIGHT');
    expect(r.problems.some((p) => /required 10, allocated 0/.test(p))).toBe(
      true,
    );
    expect(await vaPaper(ctx, s.paperId)).toBeNull();

    const save = await api.save(s.paperId, [al(v, s.dist, s.p, 10)], null);
    expect(save.status).toBe(200);
    const again = await readiness(s.paperId);
    expect(again.problems.filter((p) => COVERAGE.test(p))).toEqual([]);
  });

  it('V-129 re-finalize of a REOPENED paper does not call the Vehicle Allocation gate', async () => {
    const s = await demandScene(ctx, { qty: 10 }); // demand, nothing allocated
    await ctx.setStatus(s.sheet, 'REOPENED');
    const r = await readiness(s.paperId);
    expect(r.action).toBe('FINALIZE');
    expect(r.problems.filter((p) => COVERAGE.test(p))).toEqual([]);
  });

  it('V-143 [adapted] a MORNING save racing a Paper status change: one wins, the loser gets 400 (status), never a 5xx or a half-write', async () => {
    for (let i = 0; i < 4; i++) {
      const s = await demandScene(ctx, { qty: 10 });
      await setSheetSession(ctx, s.sheet.sheetId, 'MORNING');
      const v = await addVehicle(ctx);
      await ctx.setStatus(s.sheet, 'MORNING_SUBMITTED');

      const [save, revert] = await Promise.all([
        api.save(s.paperId, [al(v, s.dist, s.p, 10)], null, {
          session: 'MORNING',
        }),
        ctx.call(
          'post',
          `/papers/${s.paperId}/revert-morning`,
          ctx.tokens.admin,
          { reason: `V-143 race ${i}` },
        ),
      ]);
      const msg = JSON.stringify(save.body);
      expect(revert.status, JSON.stringify(revert.body)).toBe(201);
      expect([200, 400], `run ${i}: ${msg}`).toContain(save.status);

      const rows = await vaRows(ctx, s.paperId, 'MORNING');
      if (save.status === 200) {
        expect(rows).toHaveLength(1);
        expect(num(rows[0].allocated_qty)).toBe(10);
        expect(save.body.vehicleAllocationPaperUpdatedAt).toBe(
          await vaToken(ctx, s.paperId, 'MORNING'),
        );
      } else {
        expect(save.body.message).toContain(
          'cannot be edited because the paper is MORNING_SUBMITTED',
        );
        expect(rows).toHaveLength(0);
        expect(await vaPaper(ctx, s.paperId, 'MORNING')).toBeNull();
      }
    }
  }, 60000);
});
