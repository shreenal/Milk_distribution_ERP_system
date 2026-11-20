/**
 * Collections – access, throttling, request shape.
 * Scenarios: S-01 .. S-09   (spec: CD-1.3, CD-2.0, CD-5.4, CD-6.6, CD-11, CD-12.1, CD-12.2, CD-12.3)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CATS,
  PHASES,
  createCollectionsTestContext,
  entry,
  savePath,
  type CollectionsCtx,
  type Phase,
} from '../../../../test/helper/collections-harness.js';

describe('Collections access & request shape', () => {
  let ctx: CollectionsCtx;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  it('S-01 no / garbage / expired JWT → 401 on all 7 endpoints; nothing saved', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const expired = ctx.tokenFor(ctx.users.emp, { expiresIn: '-10s' });
    const calls: Record<
      string,
      (t?: string) => PromiseLike<{ status: number }>
    > = {
      get: (t) => ctx.call('get', `/collections/sheet/${sheet.sheetId}`, t),
    };
    for (const cat of CATS) {
      for (const phase of PHASES) {
        calls[`${phase}-${cat}`] = (t) =>
          ctx.call('post', savePath(sheet.sheetId, cat, phase), t, {
            entries: [entry(phase, c, 1, 1)],
            expectedUpdatedAt: null,
          });
      }
    }
    for (const [name, fn] of Object.entries(calls)) {
      for (const tok of [undefined, 'garbage', expired]) {
        const res = await fn(tok);
        expect(
          res.status,
          `${name} with token ${String(tok).slice(0, 8)}`,
        ).toBe(401);
      }
    }
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  async function allowedFor(who: 'emp' | 'admin') {
    const { sheet } = await ctx.world.scene();
    // NIGHT_SUBMITTED allows both employee phases, so empty saves are plain 200 no-ops.
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const token = ctx.tokens[who];
    expect((await ctx.col.get(sheet.sheetId, token)).status).toBe(200);
    for (const cat of CATS) {
      for (const phase of ['night', 'morning'] as Phase[]) {
        const res = await ctx.col.save(
          phase,
          cat,
          sheet.sheetId,
          [],
          null,
          token,
        );
        expect(res.status, `${phase} ${cat}`).toBe(200);
      }
    }
  }

  it('S-02 valid EMPLOYEE: GET and the four night/morning saves are allowed', () =>
    allowedFor('emp'));

  it('S-03 valid ADMIN: GET and the four night/morning saves are allowed (role hierarchy)', () =>
    allowedFor('admin'));

  it('S-04 EMPLOYEE calling milk or non-milk admin-save → 403, nothing saved', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'MORNING_SUBMITTED'); // status would allow it: only the role blocks
    for (const cat of CATS) {
      const res = await ctx.col.save(
        'admin',
        cat,
        sheet.sheetId,
        [entry('admin', c, 10, 5)],
        null,
        ctx.tokens.emp,
      );
      expect(res.status, cat).toBe(403);
    }
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-05 deactivated user with an unexpired token → 401', async () => {
    const { sheet } = await ctx.world.scene();
    const inactive = await ctx.world.addUser('EMPLOYEE', false);
    const res = await ctx.col.get(sheet.sheetId, ctx.tokenFor(inactive));
    expect(res.status).toBe(401);
  });

  it('S-06 11th save to one endpoint within 60 s → 429 (counted per endpoint); other users unaffected', async () => {
    const t = await createCollectionsTestContext({ throttle: true });
    try {
      const { sheet } = await t.world.scene();
      // empty no-op saves keep the sheet unchanged; each still counts toward the limit
      const noop = (cat: 'MILK' | 'NON_MILK', tok: string) =>
        t.col.save('night', cat, sheet.sheetId, [], null, tok);
      for (let i = 1; i <= 10; i++) {
        expect((await noop('MILK', t.tokens.emp)).status, `request ${i}`).toBe(
          200,
        );
      }
      expect((await noop('MILK', t.tokens.emp)).status).toBe(429);
      // CD-11: separate bucket per endpoint
      expect((await noop('NON_MILK', t.tokens.emp)).status).toBe(200);
      // another user is unaffected
      expect((await noop('MILK', t.tokens.admin)).status).toBe(200);
    } finally {
      await t.close();
    }
  }, 60000);

  it('S-07 unknown fields (remarks, officeAmountGiven, foo) on the body or an entry → 400, nothing saved', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'REOPENED'); // all three phases open
    const entryFields = [
      'employeeRemarks',
      'adminRemarks',
      'officeAmountGiven',
      'foo',
    ];
    const bodyFields = ['employeeRemarks', 'adminRemarks', 'foo'];
    for (const phase of PHASES) {
      for (const f of entryFields) {
        const res = await ctx.col.raw(phase, 'MILK', sheet.sheetId, {
          entries: [{ ...entry(phase, c, 1, 1), [f]: 'x' }],
          expectedUpdatedAt: null,
        });
        expect(res.status, `${phase} entry.${f}`).toBe(400);
      }
      for (const f of bodyFields) {
        const res = await ctx.col.raw(phase, 'MILK', sheet.sheetId, {
          entries: [entry(phase, c, 1, 1)],
          expectedUpdatedAt: null,
          [f]: 'x',
        });
        expect(res.status, `${phase} body.${f}`).toBe(400);
      }
    }
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-08 body carrying role or category → 400; the role comes from the JWT, the category from the URL', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const body = (extra: object) => ({
      entries: [entry('night', c, 5)],
      expectedUpdatedAt: null,
      ...extra,
    });
    expect(
      (
        await ctx.col.raw(
          'night',
          'MILK',
          sheet.sheetId,
          body({ role: 'ADMIN' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx.col.raw(
          'night',
          'NON_MILK',
          sheet.sheetId,
          body({ category: 'MILK' }),
        )
      ).status,
    ).toBe(400);
    // an employee cannot promote themselves through the body
    await ctx.setStatus(sheet, 'MORNING_SUBMITTED');
    const promoted = await ctx.col.raw(
      'admin',
      'MILK',
      sheet.sheetId,
      {
        entries: [entry('admin', c, 1, 1)],
        expectedUpdatedAt: null,
        role: 'ADMIN',
      },
      ctx.tokens.emp,
    );
    expect(promoted.status).toBe(403);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  it("S-09 any employee (or admin) can read and edit another group's sheet (CD-12.3, no per-group scoping)", async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    // emp2 is not tied to any group; the sheet belongs to a group created for this scene
    expect((await ctx.col.get(sheet.sheetId, ctx.tokens.emp2)).status).toBe(
      200,
    );
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 50)],
      null,
      ctx.tokens.emp2,
    );
    expect(res.status).toBe(200);
    expect(await ctx.col.row(sheet.sheetId, c.id, 'MILK')).not.toBeNull();
    expect((await ctx.col.get(sheet.sheetId, ctx.tokens.admin)).status).toBe(
      200,
    );
  });
});
