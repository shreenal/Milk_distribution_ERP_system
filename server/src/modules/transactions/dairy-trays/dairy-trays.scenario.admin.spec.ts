/**
 * Dairy Trays: administrative reconciliation of inactive vehicles / tray types.
 * Scenarios DY-100 to DY-103 (behavioral spec sections C8, F4). The range recalculation (DY-104 to DY-106)
 * is in the propagation spec.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import { DairyTraysModule } from './dairy-trays.module.js';
import {
  DT_DISCREPANCY,
  DT_EDIT_NOT_ALLOWED,
  DT_RETURNS_REJECTED,
  STALE_DT,
  addVehicle,
  buyTrays,
  cleanupDtTests,
  dairyRows,
  dtApi,
  dtPaper,
  dtRow,
  forwardJobs,
  ledgerScene,
  re,
  rebuildLedger,
  seedDairyLine,
  setTrayActive,
  setVehicleActive,
} from '../../../../test/helper/dairy-trays-helpers.js';

const text = (r: { body: unknown }) => JSON.stringify(r.body);

let ctx: OrdersCtx;
let dt: ReturnType<typeof dtApi>;
beforeAll(async () => {
  ctx = await createOrdersTestContext({ modules: [DairyTraysModule] });
  dt = dtApi(ctx);
});
afterAll(() => ctx.close());
afterEach(() => cleanupDtTests(ctx));

/** A NIGHT_SUBMITTED (default) paper whose only vehicle is inactive. */
async function inactiveVehicleScene(status = 'NIGHT_SUBMITTED', k = 0) {
  const s = await ledgerScene(ctx, { status, k });
  await setVehicleActive(ctx, s.v, false);
  return s;
}

describe('DY-100 reconcile inactive entities', () => {
  it('DY-100 a: an ADMIN can change the return of an inactive vehicle; same response contract as the save; token moves', async () => {
    const s = await inactiveVehicleScene();
    const old = (await s.token())!;
    const r = await dt.reconcile(s.paperId, [re(s.v, s.trayTypeId, 6)], old);
    expect(r.status, text(r)).toBe(200);
    expect(r.body).toMatchObject({ success: true, changed: true });
    expect(r.body.dairyTraysUpdatedAt).toBe(await s.token());
    expect(r.body.dairyTraysUpdatedAt).not.toBe(old);
    expect(await dtRow(ctx, s.paperId, s.v, s.trayTypeId)).toMatchObject({
      trays_returned: 6,
      closing_balance: 4,
    });
  });

  it('DY-100 b: an inactive tray type with a ledger line can be reconciled too', async () => {
    const s = await ledgerScene(ctx);
    await setTrayActive(ctx, s.trayTypeId, false);
    const r = await dt.reconcile(
      s.paperId,
      [re(s.v, s.trayTypeId, 3)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    expect(
      (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!.trays_returned,
    ).toBe(3);
  });

  it('DY-100 c: every rule of the normal save applies: status 400, stale token 409, balance 400, nothing changes', async () => {
    const closed = await inactiveVehicleScene('FINALIZED');
    const closedBefore = JSON.stringify(await dairyRows(ctx, closed.paperId));
    const wrongStatus = await dt.reconcile(
      closed.paperId,
      [re(closed.v, closed.trayTypeId, 1)],
      '2000-01-01',
    );
    expect(wrongStatus.status).toBe(400);
    expect(text(wrongStatus)).toContain(DT_EDIT_NOT_ALLOWED);
    expect(JSON.stringify(await dairyRows(ctx, closed.paperId))).toBe(
      closedBefore,
    );

    const s = await inactiveVehicleScene('NIGHT_SUBMITTED', 1);
    const stale = await dt.reconcile(
      s.paperId,
      [re(s.v, s.trayTypeId, 1)],
      '2000-01-01T00:00:00.000Z',
    );
    expect(stale.status).toBe(409);
    expect(text(stale)).toContain(STALE_DT);

    const over = await dt.reconcile(
      s.paperId,
      [re(s.v, s.trayTypeId, 11)],
      (await s.token())!,
    );
    expect(over.status, text(over)).toBe(400);
    expect(over.body.message).toBe(DT_RETURNS_REJECTED);
    expect(
      (await dtRow(ctx, s.paperId, s.v, s.trayTypeId))!.trays_returned,
    ).toBe(0);
  });

  it('DY-100 d: on a REOPENED paper a reconcile runs the forward check (409) and otherwise queues the cascade', async () => {
    // conflict: a later paper holds a return that needs the full opening of 10
    const blocked = await inactiveVehicleScene('REOPENED');
    const later = await dtPaper(ctx, 1);
    await seedDairyLine(ctx, later.paperId, blocked.v, blocked.trayTypeId, {
      opening: 10,
      taken: 0,
      returned: 10,
    });
    const conflict = await dt.reconcile(
      blocked.paperId,
      [re(blocked.v, blocked.trayTypeId, 1)],
      (await blocked.token())!,
    );
    expect(conflict.status, text(conflict)).toBe(409);
    expect(conflict.body.message).toBe(DT_DISCREPANCY);
    expect(await forwardJobs(ctx, blocked.paperId)).toHaveLength(0);

    // fits: queued
    const ok = await ledgerScene(ctx, { k: 5, status: 'REOPENED' });
    await setVehicleActive(ctx, ok.v, false);
    const r = await dt.reconcile(
      ok.paperId,
      [re(ok.v, ok.trayTypeId, 2)],
      (await ok.token())!,
    );
    expect(r.status, text(r)).toBe(200);
    expect(await forwardJobs(ctx, ok.paperId)).toHaveLength(1);
  });
});

describe('DY-101 active entities are refused on reconcile', () => {
  it('DY-101: an entry whose vehicle and tray type are both active is 400 "Use the normal save"; all such problems are listed together', async () => {
    const s = await ledgerScene(ctx);
    const v2 = await addVehicle(ctx);
    await buyTrays(ctx, s.sheet, v2, s.p, s.dist, 4);
    await rebuildLedger(ctx, s.paperId);
    const before = JSON.stringify(await dairyRows(ctx, s.paperId));

    const r = await dt.reconcile(
      s.paperId,
      [re(s.v, s.trayTypeId, 1), re(v2, s.trayTypeId, 1)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(400);
    expect(r.body.message).toBe(DT_RETURNS_REJECTED);
    expect(r.body.details).toHaveLength(2);
    for (const d of r.body.details as string[])
      expect(d).toContain(
        'is active. Use the normal save instead of reconciliation',
      );
    expect(JSON.stringify(await dairyRows(ctx, s.paperId))).toBe(before);
  });
});

describe('DY-102 and DY-103', () => {
  it('DY-102: the normal save of a changed value on an inactive vehicle is 400 read-only (the reconcile route is the way)', async () => {
    const s = await inactiveVehicleScene();
    const r = await dt.save(
      s.paperId,
      [re(s.v, s.trayTypeId, 3)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(400);
    expect(text(r)).toContain('read-only');
  });

  it('DY-103: a reconcile asks for no reason and records no user (no audit, DT-14.1)', async () => {
    const s = await inactiveVehicleScene();
    const auditsBefore = await ctx.db.paper_audit_log.count({
      where: { order_paper_id: s.paperId },
    });
    const r = await dt.reconcile(
      s.paperId,
      [re(s.v, s.trayTypeId, 2)],
      (await s.token())!,
    );
    expect(r.status, text(r)).toBe(200); // no `reason` field was sent
    expect(
      await ctx.db.paper_audit_log.count({
        where: { order_paper_id: s.paperId },
      }),
    ).toBe(auditsBefore);
  });
});
