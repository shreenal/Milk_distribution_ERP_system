/**
 * Paper: access and throttling.
 * Scenarios: P-AC-1 .. P-AC-7   (spec: PA-1.1, PA-1.2, PA-1.3)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPaperTestContext,
  type PaperCtx,
} from '../../../../test/helper/paper-harness.js';

vi.setConfig({ testTimeout: 30_000 });

const MISSING = 2147483647;
type Ep = [string, 'get' | 'post', (id: number) => string, unknown?];
const EP: Ep[] = [
  ['generate', 'post', () => '/papers', {}],
  ['current', 'get', () => '/papers/current'],
  ['list', 'get', () => '/papers'],
  ['read', 'get', (id) => `/papers/${id}`],
  ['propagation', 'get', (id) => `/papers/${id}/propagation`],
  ['readiness', 'get', (id) => `/papers/${id}/readiness`],
  ['no-operation', 'post', (id) => `/papers/${id}/sheets/no-operation`, { sheetIds: [1], noOperation: true }],
  ['submit-night', 'post', (id) => `/papers/${id}/submit-night`],
  ['submit-morning', 'post', (id) => `/papers/${id}/submit-morning`],
  ['finalize', 'post', (id) => `/papers/${id}/finalize`],
  ['reopen', 'post', (id) => `/papers/${id}/reopen`, { reason: 'r' }],
  ['revert-morning', 'post', (id) => `/papers/${id}/revert-morning`, { reason: 'r' }],
  ['propagation-retry', 'post', (id) => `/papers/${id}/propagation/retry`],
  ['propagation-dismiss', 'post', (id) => `/papers/${id}/propagation/dismiss`, { reason: 'r' }],
  ['problems', 'get', () => '/papers/propagation/problems'],
  ['audit', 'get', (id) => `/papers/${id}/audit`],
];
const ADMIN_ONLY = ['finalize', 'reopen', 'revert-morning', 'propagation-retry', 'propagation-dismiss', 'problems', 'audit'];

describe('access (no throttling)', () => {
  let ctx: PaperCtx;
  beforeAll(async () => {
    ctx = await createPaperTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => ctx.pp.cleanup());

  const call = (ep: Ep, id: number, token: string | null) =>
    ctx.call(ep[1], ep[2](id), token, ep[3]);

  describe.each([
    ['no token', () => null],
    ['garbage token', () => 'not-a-jwt'],
    ['expired token', () => ctx.tokenFor(ctx.users.emp, { expiresIn: -60 } as never)],
  ])('P-AC-1 %s', (_label, token) => {
    it.each(EP)('%s -> 401, nothing changes', async (...args) => {
      const ep = args as unknown as Ep;
      const s = await ctx.world.newSheet();
      const before = await ctx.pp.snapshot(s.paperId);
      const res = await call(ep, s.paperId, token());
      expect(res.status).toBe(401);
      expect(await ctx.pp.snapshot(s.paperId)).toBe(before);
    });
  });

  it.each(EP.filter((e) => ADMIN_ONLY.includes(e[0])))(
    'P-AC-2 EMPLOYEE on %s -> 403, nothing changes',
    async (...args) => {
      const ep = args as unknown as Ep;
      const s = await ctx.world.newSheet({ status: 'FINALIZED' });
      const before = await ctx.pp.snapshot(s.paperId);
      const res = await call(ep, s.paperId, ctx.tokens.emp);
      expect(res.status).toBe(403);
      expect(await ctx.pp.snapshot(s.paperId)).toBe(before);
    },
  );

  // generate is left out: ADMIN generate is exercised by P-G-14 .. P-G-17 under a frozen clock.
  it.each(EP.filter((e) => e[0] !== 'generate'))(
    'P-AC-3 ADMIN on %s is allowed (neither 401 nor 403)',
    async (...args) => {
      const ep = args as unknown as Ep;
      const s = await ctx.world.newSheet();
      const res = await call(ep, s.paperId, ctx.tokens.admin);
      expect([401, 403]).not.toContain(res.status);
    },
  );

  it('P-AC-4 EMPLOYEE reads any paper, its propagation and its readiness (no scoping)', async () => {
    for (const status of ['DRAFT', 'FINALIZED']) {
      const s = await ctx.world.newSheet({ status: status as never });
      expect((await ctx.pp.api.get(s.paperId)).status).toBe(200);
      expect((await ctx.pp.api.propagation(s.paperId)).status).toBe(200);
      expect((await ctx.pp.api.readiness(s.paperId)).status).toBe(200);
    }
  });
});

describe('throttling', () => {
  let ctx: PaperCtx;
  beforeAll(async () => {
    ctx = await createPaperTestContext({ throttle: true });
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => ctx.pp.cleanup());

  type L = [string, 'post', (id: number) => string, 'emp' | 'admin', unknown];
  const LIMIT10: L[] = [
    // a malformed date is rejected by the DTO after the guard has counted the request: no data is touched
    ['generate', 'post', () => '/papers', 'emp', { date: 'bad' }],
    ['submit-night', 'post', (id) => `/papers/${id}/submit-night`, 'emp', undefined],
    ['submit-morning', 'post', (id) => `/papers/${id}/submit-morning`, 'emp', undefined],
    ['finalize', 'post', (id) => `/papers/${id}/finalize`, 'admin', undefined],
    ['reopen', 'post', (id) => `/papers/${id}/reopen`, 'admin', { reason: 'r' }],
    ['revert-morning', 'post', (id) => `/papers/${id}/revert-morning`, 'admin', { reason: 'r' }],
    ['propagation-retry', 'post', (id) => `/papers/${id}/propagation/retry`, 'admin', undefined],
    ['propagation-dismiss', 'post', (id) => `/papers/${id}/propagation/dismiss`, 'admin', { reason: 'r' }],
  ];

  const hammer = async (
    method: 'get' | 'post',
    path: string,
    token: string,
    body: unknown,
    times: number,
  ) => {
    const out: number[] = [];
    for (let i = 0; i < times; i++) out.push((await ctx.call(method, path, token, body)).status);
    return out;
  };

  it.each(LIMIT10)('P-AC-5 %s: 10 per minute, the 11th is 429', async (...args) => {
    const [, method, path, who, body] = args as unknown as L;
    const statuses = await hammer(method, path(MISSING), ctx.tokens[who], body, 11);
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });

  it('P-AC-6 no-operation: 20 per minute (21st is 429); readiness: 30 per minute (31st is 429)', async () => {
    const noOp = await hammer(
      'post',
      `/papers/${MISSING}/sheets/no-operation`,
      ctx.tokens.emp,
      { sheetIds: [1], noOperation: true },
      21,
    );
    expect(noOp.slice(0, 20)).not.toContain(429);
    expect(noOp[20]).toBe(429);

    const readiness = await hammer('get', `/papers/${MISSING}/readiness`, ctx.tokens.emp, undefined, 31);
    expect(readiness.slice(0, 30)).not.toContain(429);
    expect(readiness[30]).toBe(429);
  });

  it('P-AC-7 two users keep independent quotas even from one IP', async () => {
    const path = `/papers/${MISSING}/submit-night`;
    const first = await hammer('post', path, ctx.tokens.emp, undefined, 11);
    expect(first[10]).toBe(429);
    const other = await ctx.call('post', path, ctx.tokens.emp2);
    expect(other.status).not.toBe(429);
    expect((await ctx.call('post', path, ctx.tokens.emp)).status).toBe(429);
  });
});
