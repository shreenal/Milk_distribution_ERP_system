/**
 * Paper: read endpoints, propagation summary, workflow flags.
 * Scenarios: P-R-1 .. P-R-18, P-W-1 .. P-W-7   (spec: PA-5, PA-10.2, PA-13)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPaperTestContext,
  flags,
  MSG,
  saleDateOf,
  STATUSES,
  ymd,
  type PaperCtx,
} from '../../../../test/helper/paper-harness.js';
import { PaperRepository } from './paper.repository.js';

vi.setConfig({ testTimeout: 30_000 });

const NOW = '2097-03-10T10:00:00Z';
const DELIVERY = '2097-03-10';
const ORDERING = '2097-03-11';
const MISSING = 2147483647;

let ctx: PaperCtx;
beforeAll(async () => {
  ctx = await createPaperTestContext();
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => ctx.pp.cleanup());

const emptyPropagation = {
  status: 'COMPLETE',
  pending: 0,
  processing: 0,
  failed: 0,
  done: 0,
  dismissed: 0,
  failures: [],
};

describe('P-R current / by date', () => {
  it('P-R-1 / P-W-7 /papers/current: both papers by name, each with its REAL workflow flags and propagation', async () => {
    const t = ctx.pp.freeze(NOW);
    const del = await ctx.world.newSheet({ saleDate: new Date(DELIVERY), status: 'MORNING_SUBMITTED' });
    const ord = await ctx.world.newSheet({ saleDate: new Date(ORDERING), status: 'DRAFT' });
    const res = await ctx.pp.api.current(t.emp);
    expect(res.status).toBe(200);
    expect(res.body.dates).toEqual({ delivery: DELIVERY, ordering: ORDERING });
    expect(res.body.delivery.paper.id).toBe(del.paperId);
    expect(res.body.ordering.paper.id).toBe(ord.paperId);
    expect(res.body.delivery.workflow).toEqual(flags('MORNING_SUBMITTED'));
    expect(res.body.ordering.workflow).toEqual(flags('DRAFT'));
    expect(res.body.delivery.propagation).toEqual(emptyPropagation);
    expect(res.body.ordering.paper.order_sheet).toHaveLength(1);
  });

  it('P-R-2 neither paper exists: both null, dates still present', async () => {
    const t = ctx.pp.freeze(NOW);
    const res = await ctx.pp.api.current(t.emp);
    expect(res.body).toEqual({ dates: { delivery: DELIVERY, ordering: ORDERING }, delivery: null, ordering: null });
  });

  it('P-R-3 only one exists: the other is null', async () => {
    const t = ctx.pp.freeze(NOW);
    await ctx.world.newSheet({ saleDate: new Date(ORDERING) });
    const res = await ctx.pp.api.current(t.emp);
    expect(res.body.delivery).toBeNull();
    expect(res.body.ordering).not.toBeNull();
  });

  it('P-R-4 ?date= returns the paper view; page and pageSize are not used for the lookup', async () => {
    const s = await ctx.world.newSheet({ saleDate: saleDateOf(0) });
    const res = await ctx.pp.api.list(`?date=${ymd(saleDateOf(0))}&page=3&pageSize=7`);
    expect(res.status).toBe(200);
    expect(res.body.paper.id).toBe(s.paperId);
    expect(Object.keys(res.body).sort()).toEqual(['paper', 'propagation', 'workflow']);
  });

  it('P-R-5 ?date= with no paper: 404', async () => {
    const res = await ctx.pp.api.list('?date=2097-12-30');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(MSG.PAPER_NOT_FOUND);
  });

  it.each(['2026-02-31', '2026-1-5'])('P-R-6 ?date=%s: 400', async (d) => {
    expect((await ctx.pp.api.list(`?date=${d}`)).status).toBe(400);
  });

  it('P-R-16 empty ?date= is treated as the list', async () => {
    const res = await ctx.pp.api.list('?date=');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
  });
});

describe('P-R list and paging', () => {
  it('P-R-7 list: {total, page 1, pageSize 50, items}, newest sale date first, items carry no sheets and no propagation', async () => {
    const a = await ctx.world.newSheet({ saleDate: saleDateOf(0) });
    const b = await ctx.world.newSheet({ saleDate: saleDateOf(2) });
    const c = await ctx.world.newSheet({ saleDate: saleDateOf(1) });
    const res = await ctx.pp.api.list();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 50 });
    expect(typeof res.body.total).toBe('number');
    const ours = res.body.items.filter((i: any) => [a, b, c].some((s) => s.paperId === i.paper.id));
    expect(ours.map((i: any) => i.paper.id)).toEqual([b.paperId, c.paperId, a.paperId]);
    for (const item of ours) {
      expect(Object.keys(item).sort()).toEqual(['paper', 'workflow']);
      expect(item.paper).not.toHaveProperty('order_sheet');
    }
  });

  it.each([['0', 1], ['-3', 1]])('P-R-8 page=%s is applied as page %i', async (page, applied) => {
    const res = await ctx.pp.api.list(`?page=${page}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(applied);
  });

  it.each([['?pageSize=0', 50], ['', 50], ['?pageSize=500', 200], ['?pageSize=-4', 1]])(
    'P-R-9 %s -> pageSize applied %i (echoed in the response)',
    async (qs, applied) => {
      const res = await ctx.pp.api.list(qs);
      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(applied);
    },
  );

  // Q12 of the discovery: 1.5 depends on the installed Nest ParseIntPipe. Written for the SPECIFIED behaviour (400).
  it.each(['?page=abc', '?page=1.5', '?pageSize=abc', '?pageSize=1.5'])('P-R-10 %s: 400', async (qs) => {
    expect((await ctx.pp.api.list(qs)).status).toBe(400);
  });

  it('P-R-11 empty system: 200 with total 0 and no items, never 404 (seam: repository answers an empty page)', async () => {
    const repo = ctx.app.get(PaperRepository, { strict: false });
    vi.spyOn(repo, 'findAllPapers').mockResolvedValue({ papers: [], total: 0, page: 1, pageSize: 50 });
    const res = await ctx.pp.api.list();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, items: [] });
  });
});

describe('P-R by id', () => {
  it('P-R-12 /papers/7 and /papers/007 are the same paper', async () => {
    const s = await ctx.world.newSheet();
    const plain = await ctx.pp.api.get(s.paperId);
    const padded = await ctx.pp.api.get(String(s.paperId).padStart(10, '0'));
    expect(plain.status).toBe(200);
    expect(padded.status).toBe(200);
    expect(padded.body.paper.id).toBe(s.paperId);
    expect(plain.body.paper.order_sheet).toHaveLength(1);
  });

  it.each(['0', '-1', 'abc', '1.5', '2147483648'])('P-R-13 id %s: 400 Invalid id', async (id) => {
    const res = await ctx.pp.api.get(id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid id');
  });

  it('P-R-14 a valid id that does not exist: 404', async () => {
    expect((await ctx.pp.api.get(MISSING)).status).toBe(404);
  });

  it('P-R-15 "current" and "propagation/problems" are not read as paper ids', async () => {
    expect((await ctx.pp.api.current()).status).toBe(200);
    const res = await ctx.pp.api.problems();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('P-R propagation summary', () => {
  const summary = async (rows: [string, Record<string, unknown>?][]) => {
    const s = await ctx.world.newSheet();
    for (const [status, o] of rows) await ctx.pp.seedOutbox(s.paperId, status, o as never);
    return (await ctx.pp.api.propagation(s.paperId)).body;
  };

  it('P-R-17a no rows: COMPLETE with zero counts', async () => {
    expect(await summary([])).toEqual(emptyPropagation);
  });

  it('P-R-17b DONE and DISMISSED only: COMPLETE; dismissed is counted but ignored for status', async () => {
    expect(await summary([['DONE'], ['DISMISSED']])).toMatchObject({ status: 'COMPLETE', done: 1, dismissed: 1, failed: 0 });
  });

  it.each([['PENDING'], ['PROCESSING']])('P-R-17c %s: IN_PROGRESS', async (status) => {
    const body = await summary([['DONE'], [status]]);
    expect(body.status).toBe('IN_PROGRESS');
  });

  it('P-R-17d any FAILED wins: FAILED, failures[] carries id, type, attempts, last_error and time', async () => {
    const body = await summary([['PENDING'], ['FAILED', { type: 'DAIRY_TRAYS_FORWARD', attempts: 5, error: 'boom' }]]);
    expect(body).toMatchObject({ status: 'FAILED', pending: 1, failed: 1 });
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0]).toMatchObject({ type: 'DAIRY_TRAYS_FORWARD', attempts: 5, last_error: 'boom' });
    expect(body.failures[0]).toHaveProperty('id');
    expect(body.failures[0]).toHaveProperty('updated_at');
  });

  it('P-R-18 propagation of a missing paper: 404', async () => {
    expect((await ctx.pp.api.propagation(MISSING)).status).toBe(404);
  });
});

describe('P-W workflow flags', () => {
  it.each(STATUSES.map((s, i) => [`P-W-${i + 1}`, s]))('%s %s: the flags are exactly the PA-13.1 row', async (_id, status) => {
    const s = await ctx.world.newSheet({ status });
    const res = await ctx.pp.api.get(s.paperId);
    expect(res.body.workflow).toEqual(flags(status));
  });

  it('P-W-6 flags are advisory: canFinalize is true but the action still rechecks (previous paper not finalized -> 409)', async () => {
    const s = await ctx.world.newSheet({ saleDate: saleDateOf(0), status: 'MORNING_SUBMITTED' });
    await ctx.world.newSheet({ saleDate: saleDateOf(-1), status: 'DRAFT' });
    expect((await ctx.pp.api.get(s.paperId)).body.workflow.canFinalize).toBe(true);
    const res = await ctx.pp.api.finalize(s.paperId);
    expect(res.status).toBe(409);
    expect((await ctx.pp.paper(s.paperId)).status).toBe('MORNING_SUBMITTED');
  });
});
