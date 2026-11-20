/**
 * Paper: generate and backfill.
 * Scenarios: P-G-1 .. P-G-25   (spec: PA-3, PA-4, PA-12, PA-20.1)
 *
 * The clock is frozen (Date only) at 2097-03-10 15:30 IST, so "tomorrow (IST)" is 2097-03-11. RUN THIS FILE WITH
 * FILE PARALLELISM OFF: P-G-7 and P-G-19 temporarily deactivate every group in the shared test database.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPaperTestContext,
  dbError,
  flags,
  MSG,
  shift,
  STATUSES,
  type PaperCtx,
} from '../../../../test/helper/paper-harness.js';
import { PaperRepository } from './paper.repository.js';

vi.setConfig({ testTimeout: 30_000 });

const NOW = '2097-03-10T10:00:00Z'; // 15:30 IST
const DELIVERY = '2097-03-10';
const ORDERING = '2097-03-11';
const PAST = '2097-03-09';

let ctx: PaperCtx;
let tk: { emp: string; admin: string };
beforeAll(async () => {
  ctx = await createPaperTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  tk = ctx.pp.freeze(NOW);
});
afterEach(() => ctx.pp.cleanup());

const gen = (body?: unknown, token = tk.emp) => ctx.pp.api.generate(body, token);
const paperAt = (day: string) => ctx.db.order_paper.findFirst({ where: { sale_date: new Date(day) } });
const countAt = (day: string) => ctx.db.order_paper.count({ where: { sale_date: new Date(day) } });
const dayOf = (v: string) => v.slice(0, 10);

describe('P-G create', () => {
  it('P-G-1 no body: DRAFT paper for tomorrow (IST), one sheet per active group, dairy header, one audit row, status 200', async () => {
    const groups = await ctx.pp.activeGroups();
    const res = await gen();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DRAFT');
    expect(dayOf(res.body.sale_date)).toBe(ORDERING);
    expect(dayOf(res.body.order_date)).toBe(DELIVERY);
    expect(res.body.order_sheet).toHaveLength(groups.length);
    for (const g of groups) {
      const sheet = res.body.order_sheet.find((s: any) => s.group_id === g.id);
      expect(sheet.delivery_session).toBe(g.delivery_session);
    }
    expect(res.body.workflow).toEqual(flags('DRAFT'));
    expect(await ctx.db.dairy_tray_paper.findUnique({ where: { order_paper_id: res.body.id } })).not.toBeNull();
    const rows = await ctx.pp.audits(res.body.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'GENERATED', to_status: 'DRAFT', user_id: ctx.users.emp.id, reason: null });
    expect(rows[0].details).toMatchObject({ saleDate: ORDERING, sheets: groups.length });
  });

  it('P-G-2 generating again returns the same paper; no new rows, no audit', async () => {
    const first = await gen();
    const second = await gen();
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await countAt(ORDERING)).toBe(1);
    expect(await ctx.pp.audits(first.body.id)).toHaveLength(1);
  });

  it.each(STATUSES)('P-G-3 existing paper in %s: returned as is to EMPLOYEE and ADMIN', async (status) => {
    const first = await gen();
    await ctx.pp.setStatus(first.body.id, status);
    for (const token of [tk.emp, tk.admin]) {
      const res = await gen(undefined, token);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(first.body.id);
      expect(res.body.status).toBe(status);
      expect(res.body.workflow).toEqual(flags(status));
      expect(res.body.order_sheet).toHaveLength(first.body.order_sheet.length);
    }
    expect(await ctx.pp.audits(first.body.id)).toHaveLength(1);
  });

  it('P-G-4 DRAFT paper, group activated after generation: re-generate adds its sheet and audits it', async () => {
    const first = await gen();
    const g = await ctx.world.addGroup();
    const res = await gen();
    expect(res.status).toBe(200);
    expect(res.body.order_sheet.some((s: any) => s.group_id === g.id)).toBe(true);
    const keep = new Set(first.body.order_sheet.map((s: any) => s.id));
    for (const id of keep) expect(res.body.order_sheet.some((s: any) => s.id === id)).toBe(true);
    const rows = await ctx.pp.audits(first.body.id, 'GENERATED');
    expect(rows).toHaveLength(2);
    expect(rows[1].details).toMatchObject({ existingPaper: true });
    expect((rows[1].details as any).groupIds).toContain(g.id);
    expect((rows[1].details as any).sheetsAdded).toBeGreaterThanOrEqual(1);
  });

  it('P-G-5 paper past DRAFT: a new active group gets no sheet', async () => {
    const first = await gen();
    await ctx.pp.setStatus(first.body.id, 'NIGHT_SUBMITTED');
    await ctx.world.addGroup();
    const res = await gen();
    expect(res.body.order_sheet).toHaveLength(first.body.order_sheet.length);
    expect(await ctx.pp.audits(first.body.id)).toHaveLength(1);
  });

  it('P-G-6 group deactivated after generation keeps its sheet', async () => {
    const g = await ctx.world.addGroup();
    const first = await gen();
    expect(first.body.order_sheet.some((s: any) => s.group_id === g.id)).toBe(true);
    await ctx.db.master_group.update({ where: { id: g.id }, data: { is_active: false } });
    for (const res of [await gen(), await ctx.pp.api.get(first.body.id, tk.emp)]) {
      const sheets = res.body.order_sheet ?? res.body.paper.order_sheet;
      expect(sheets.some((s: any) => s.group_id === g.id)).toBe(true);
    }
  });

  it('P-G-7 no active group and no paper: 400, nothing created', async () => {
    await ctx.pp.deactivateAllGroups();
    const res = await gen();
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MSG.NO_ACTIVE_GROUPS);
    expect(await paperAt(ORDERING)).toBeNull();
  });

  it('P-G-8 date = tomorrow (IST) behaves like no date and is audited as GENERATED', async () => {
    const res = await gen({ date: ORDERING });
    expect(res.status).toBe(200);
    expect(dayOf(res.body.sale_date)).toBe(ORDERING);
    expect((await ctx.pp.audits(res.body.id))[0].action).toBe('GENERATED');
  });

  it('P-G-9 date later than tomorrow: 400 naming the latest allowed date', async () => {
    const res = await gen({ date: shift(ORDERING, 1) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MSG.FUTURE(ORDERING));
    expect(await paperAt(shift(ORDERING, 1))).toBeNull();
  });

  it.each(['2026-1-5', 'abc', 20260105])('P-G-10 malformed date %s: 400 "date must be in YYYY-MM-DD format"', async (date) => {
    const res = await gen({ date });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('date must be in YYYY-MM-DD format');
  });

  it('P-G-11 impossible calendar date (2097-02-31): 400 Invalid date format', async () => {
    const res = await gen({ date: '2097-02-31' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MSG.INVALID_DATE);
  });

  it('P-G-12 unknown body field: 400', async () => {
    expect((await gen({ foo: 1 })).status).toBe(400);
    expect(await paperAt(ORDERING)).toBeNull();
  });
});

describe('P-G backfill', () => {
  it('P-G-13 EMPLOYEE with a past date and no paper: 403', async () => {
    const res = await gen({ date: PAST, reason: 'missed' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(MSG.BACKFILL_ADMIN_ONLY);
    expect(await paperAt(PAST)).toBeNull();
  });

  it('P-G-14 ADMIN backfill without a usable reason: 400, nothing created', async () => {
    const missing = await gen({ date: PAST }, tk.admin);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe(MSG.BACKFILL_REASON);
    for (const reason of ['', '   ']) {
      expect((await gen({ date: PAST, reason }, tk.admin)).status).toBe(400);
    }
    expect(await paperAt(PAST)).toBeNull();
  });

  it('P-G-15 reason of 1001 characters: 400', async () => {
    expect((await gen({ date: PAST, reason: 'x'.repeat(1001) }, tk.admin)).status).toBe(400);
    expect(await paperAt(PAST)).toBeNull();
  });

  it('P-G-16 reason of 1000 characters after trimming: created, audited as GENERATED_BACKFILL with the reason', async () => {
    const reason = 'r'.repeat(1000);
    const res = await gen({ date: PAST, reason: `  ${reason}  ` }, tk.admin);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DRAFT');
    const rows = await ctx.pp.audits(res.body.id);
    expect(rows[0]).toMatchObject({ action: 'GENERATED_BACKFILL', reason, user_id: ctx.users.admin.id });
  });

  it('P-G-17 window: ordering date - 31 days is created, - 32 days is 400', async () => {
    const ok = await gen({ date: shift(ORDERING, -31), reason: 'window' }, tk.admin);
    expect(ok.status).toBe(200);
    const tooOld = await gen({ date: shift(ORDERING, -32), reason: 'window' }, tk.admin);
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.message).toBe(MSG.BACKFILL_TOO_OLD);
    expect(await paperAt(shift(ORDERING, -32))).toBeNull();
  });

  it('P-G-18 past paper already exists: EMPLOYEE gets it back (no 403, no reason needed, no audit)', async () => {
    const existing = await ctx.world.newSheet({ saleDate: new Date(PAST) });
    const res = await gen({ date: PAST });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.paperId);
    expect(await ctx.pp.audits(existing.paperId)).toHaveLength(0);
  });

  it('P-G-19 past date with no active group: ADMIN with a reason gets 400', async () => {
    await ctx.pp.deactivateAllGroups();
    const res = await gen({ date: PAST, reason: 'missed' }, tk.admin);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MSG.NO_ACTIVE_GROUPS);
    expect(await paperAt(PAST)).toBeNull();
  });
});

describe('P-G time, concurrency, errors', () => {
  it('P-G-20 00:30 IST (previous day in UTC): the sale date is the IST tomorrow, not the UTC tomorrow', async () => {
    tk = ctx.pp.freeze('2097-03-09T19:00:00Z'); // 2097-03-10 00:30 IST
    const res = await gen();
    expect(res.status).toBe(200);
    expect(dayOf(res.body.sale_date)).toBe('2097-03-11');
    expect(dayOf(res.body.order_date)).toBe('2097-03-10');
  });

  it('P-G-21 two concurrent requests for one date: both succeed with the same paper, exactly one is created and audited', async () => {
    const [a, b] = await Promise.all([gen(), gen()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.id).toBe(b.body.id);
    expect(await countAt(ORDERING)).toBe(1);
    expect(await ctx.pp.audits(a.body.id, 'GENERATED')).toHaveLength(1);
  });

  it('P-G-22 a unique violation with no paper for that date is not swallowed: 409 (seam: order date already taken)', async () => {
    await ctx.db.order_paper.create({ data: { order_date: new Date(DELIVERY), sale_date: new Date('2097-04-20') } });
    const res = await gen();
    expect(res.status).toBe(409);
    expect(await paperAt(ORDERING)).toBeNull();
  });

  it('P-G-23 a reason sent without a backfill is ignored (audit reason null)', async () => {
    const res = await gen({ reason: 'ignored' });
    expect(res.status).toBe(200);
    expect((await ctx.pp.audits(res.body.id))[0].reason).toBeNull();
  });

  it('P-G-24 transaction timeout (seam: P2028): 409 "took too long", nothing saved', async () => {
    const repo = ctx.app.get(PaperRepository, { strict: false });
    vi.spyOn(repo, 'getActiveGroups').mockRejectedValue(dbError('P2028'));
    const res = await gen();
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(MSG.TIMEOUT);
    expect(await paperAt(ORDERING)).toBeNull();
  });

  it('P-G-25a a backfilled paper gets sheets for the groups active NOW only', async () => {
    const off = await ctx.world.addGroup();
    const on = await ctx.world.addGroup();
    await ctx.db.master_group.update({ where: { id: off.id }, data: { is_active: false } });
    const res = await gen({ date: PAST, reason: 'missed' }, tk.admin);
    expect(res.status).toBe(200);
    const ids = res.body.order_sheet.map((s: any) => s.group_id);
    expect(ids).toContain(on.id);
    expect(ids).not.toContain(off.id);
  });

  // P-G-25b (rates resolved as of the paper's own sale date) belongs to Orders (OD-9.1); see the coverage map.
  it.todo('P-G-25b backfilled paper resolves rates as of its own sale date (Orders-owned, OD-9.1)');
});
