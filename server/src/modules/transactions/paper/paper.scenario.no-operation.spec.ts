/**
 * Paper: no-operation routes.
 * Scenarios: P-N-1 .. P-N-10   (spec: PA-17, PA-6.5 as amended by revision 2 / Q14, PA-20.1)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPaperTestContext,
  details,
  MSG,
  n,
  type PaperCtx,
} from '../../../../test/helper/paper-harness.js';

vi.setConfig({ testTimeout: 30_000 });

let ctx: PaperCtx;
beforeAll(async () => {
  ctx = await createPaperTestContext();
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => ctx.pp.cleanup());

const twoSheets = async (status = 'DRAFT') => {
  const a = await ctx.world.newSheet({ status: status as never });
  const b = await ctx.pp.addEmptySheet(a.paperId);
  return { paperId: a.paperId, s1: a.sheetId, s2: b.sheetId, g1: a.group, g2: b.group };
};
const flagOf = async (sheetId: number) => (await ctx.sheetRow(sheetId)).no_operation;
const noOps = (paperId: number) => ctx.pp.audits(paperId, 'SHEET_OPERATION_CHANGED');

describe('P-N marking', () => {
  it('P-N-1 DRAFT: mark two sheets -> refreshed {paper, workflow, propagation}, audited, updated_at NOT advanced', async () => {
    const t = await twoSheets();
    const before = (await ctx.pp.paper(t.paperId)).updated_at;
    const res = await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1, t.s2], noOperation: true });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['paper', 'propagation', 'workflow']);
    expect(res.body.paper.order_sheet.every((s: any) => s.no_operation === true)).toBe(true);
    const rows = await noOps(t.paperId);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatchObject({ noOperation: true, changed: 2, sheetIds: [t.s1, t.s2] });
    expect([...(rows[0].details as any).routes].sort()).toEqual([t.g1.name, t.g2.name].sort());
    expect(rows[0].user_id).toBe(ctx.users.emp.id);
    expect((await ctx.pp.paper(t.paperId)).updated_at.getTime()).toBe(before.getTime());
  });

  it('P-N-2 marking what is already marked changes nothing and writes no audit row', async () => {
    const t = await twoSheets();
    await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1, t.s2], noOperation: true });
    const res = await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1, t.s2], noOperation: true });
    expect(res.status).toBe(200);
    expect(await noOps(t.paperId)).toHaveLength(1);
  });

  it('P-N-3 one sheet already marked: changed = 1, requested ids recorded', async () => {
    const t = await twoSheets();
    await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1], noOperation: true });
    await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1, t.s2], noOperation: true });
    const rows = await noOps(t.paperId);
    expect(rows[1].details).toMatchObject({ changed: 1, sheetIds: [t.s1, t.s2] });
  });

  it('P-N-4 unmark: flag false, audited with noOperation false', async () => {
    const t = await twoSheets();
    await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1], noOperation: true });
    const res = await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1], noOperation: false });
    expect(res.status).toBe(200);
    expect(await flagOf(t.s1)).toBe(false);
    expect((await noOps(t.paperId))[1].details).toMatchObject({ noOperation: false, changed: 1 });
  });

  it.each(['NIGHT_SUBMITTED', 'MORNING_SUBMITTED', 'FINALIZED', 'REOPENED'])(
    'P-N-5 paper %s: 400, nothing changes',
    async (status) => {
      const t = await twoSheets(status);
      const res = await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1], noOperation: true });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(MSG.NOOP_DRAFT_ONLY(status));
      expect(await flagOf(t.s1)).toBe(false);
    },
  );

  it('P-N-6 a sheet of another paper in the list: 400 naming it, nothing at all is changed', async () => {
    const t = await twoSheets();
    const other = await ctx.world.newSheet();
    const res = await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1, other.sheetId], noOperation: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MSG.SHEETS_NOT_IN_PAPER([other.sheetId], t.paperId));
    expect(await flagOf(t.s1)).toBe(false);
    expect(await noOps(t.paperId)).toHaveLength(0);
  });

  it.each([
    ['empty list', { sheetIds: [], noOperation: true }],
    ['201 items', { sheetIds: Array.from({ length: 201 }, (_, i) => i + 1), noOperation: true }],
    ['duplicates', { sheetIds: [1, 1], noOperation: true }],
    ['non-integer', { sheetIds: [1.5], noOperation: true }],
    ['zero', { sheetIds: [0], noOperation: true }],
    ['above 2147483647', { sheetIds: [2147483648], noOperation: true }],
    ['noOperation missing', { sheetIds: [1] }],
    ['noOperation not boolean', { sheetIds: [1], noOperation: 'yes' }],
    ['unknown field', { sheetIds: [1], noOperation: true, foo: 1 }],
  ])('P-N-7 invalid body (%s): 400', async (_label, body) => {
    const t = await twoSheets();
    expect((await ctx.pp.api.noOp(t.paperId, body)).status).toBe(400);
    expect(await noOps(t.paperId)).toHaveLength(0);
  });

  it('P-N-8 no such paper: 404', async () => {
    expect((await ctx.pp.api.noOp(2147483647, { sheetIds: [1], noOperation: true })).status).toBe(404);
  });
});

describe('P-N effect on night submit (revision 2: a marked sheet is exempt at night whether or not it has lines)', () => {
  it('P-N-9a sheet whose only line was zeroed: unmarked blocks, marked passes the Orders check and the paper submits', async () => {
    const s = await ctx.world.scene({ products: [{}], clients: 1 });
    const [c] = s.clients;
    const [p] = s.products;
    await ctx.seedNight(s.sheet, [n(c, p, 5)]);
    await ctx.seedNight(s.sheet, [n(c, p, 0)]);

    const blocked = await ctx.pp.api.submitNight(s.sheet.paperId);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe(MSG.NIGHT_NOT_READY);
    expect(details(blocked).some((d) => d.includes(s.group.name))).toBe(true);

    expect((await ctx.pp.api.noOp(s.sheet.paperId, { sheetIds: [s.sheet.sheetId], noOperation: true })).status).toBe(200);
    const ok = await ctx.pp.api.submitNight(s.sheet.paperId);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('NIGHT_SUBMITTED');
  });

  it('P-N-9b a marked sheet that still carries a positive order passes the Orders check at night (PA-6.5, Q14)', async () => {
    const s = await ctx.pp.paperScene({ qty: 5 });
    await ctx.db.order_sheet.update({ where: { id: s.sheetId }, data: { no_operation: true } });
    expect((await ctx.pp.api.submitNight(s.paperId)).status).toBe(200);
  });

  // Seam: marking is DRAFT-only and Cash Settlement saves are NIGHT_SUBMITTED/REOPENED-only, so "mark, then save
  // Cash Settlement with the same token" cannot be executed end to end. The token half is asserted: marking leaves
  // order_paper.updated_at (= cashSettlementUpdatedAt) untouched.
  it('P-N-10 marking does not move the Cash Settlement token', async () => {
    const t = await twoSheets();
    const read = async () => (await ctx.call('get', `/cash-settlement/${t.paperId}`, ctx.tokens.emp)).body.cashSettlementUpdatedAt;
    const before = await read();
    expect((await ctx.pp.api.noOp(t.paperId, { sheetIds: [t.s1, t.s2], noOperation: true })).status).toBe(200);
    expect(await read()).toBe(before);
  });
});
