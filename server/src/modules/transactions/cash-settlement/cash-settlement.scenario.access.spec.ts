/**
 * Cash Settlement – access, throttling, request shape.
 * Scenarios: S-01 .. S-08   (spec: CS-1.1, CS-1.2, CS-1.3, CS-5.1)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createCashTestContext,
  SECTIONS,
  ok,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – access', () => {
  let ctx: CashCtx;
  beforeAll(async () => {
    ctx = await createCashTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.cs.cleanup();
  });

  it('S-01 no, garbage or expired JWT: 401 on the read and on all four saves', async () => {
    const s = await ctx.cs.scene();
    const tokens: Record<string, string | null> = {
      none: null,
      garbage: 'garbage',
      expired: ctx.tokenFor(ctx.users.emp, { expiresIn: '-10s' }),
    };
    for (const [name, token] of Object.entries(tokens)) {
      expect((await ctx.cs.get(s.paperId, token)).status, `GET ${name}`).toBe(
        401,
      );
      for (const section of SECTIONS) {
        const res = await ctx.cs.save(
          section,
          s.paperId,
          [],
          await ctx.cs.paperToken(s.paperId),
          { token },
        );
        expect(res.status, `${section} ${name}`).toBe(401);
      }
    }
  });

  it('S-02 / S-03 EMPLOYEE and ADMIN are both allowed on the read and on all four saves', async () => {
    const s = await ctx.cs.scene();
    for (const token of [ctx.tokens.emp, ctx.tokens.admin]) {
      ok(await ctx.cs.get(s.paperId, token));
      for (const section of SECTIONS) {
        ok(
          await ctx.cs.save(
            section,
            s.paperId,
            [],
            await ctx.cs.paperToken(s.paperId),
            { token },
          ),
        );
      }
    }
  });

  it('S-04 a deactivated user with an unexpired token gets 401', async () => {
    const s = await ctx.cs.scene();
    const inactive = await ctx.world.addUser('EMPLOYEE', false);
    const token = ctx.tokenFor(inactive);
    expect((await ctx.cs.get(s.paperId, token)).status).toBe(401);
    expect(
      (
        await ctx.cs.save(
          'expenses',
          s.paperId,
          [],
          await ctx.cs.paperToken(s.paperId),
          { token },
        )
      ).status,
    ).toBe(401);
  });

  it('S-06 an unknown field (remarks, depositReference, role, foo) at body or entry level: 400, nothing saved', async () => {
    const s = await ctx.cs.scene();
    const tokenBefore = await ctx.cs.paperToken(s.paperId);
    for (const section of SECTIONS) {
      const token = await ctx.cs.paperToken(s.paperId);
      for (const field of ['remarks', 'depositReference', 'role', 'foo']) {
        const top = await ctx.cs.save(section, s.paperId, [], token, {
          extra: { [field]: 'x' },
        });
        expect(top.status, `${section} body.${field}`).toBe(400);
        const entry = {
          ...(ctx.cs.changing(section, s) as object),
          [field]: 'x',
        };
        const inner = await ctx.cs.save(section, s.paperId, [entry], token);
        expect(inner.status, `${section} entry.${field}`).toBe(400);
      }
    }
    expect(await ctx.cs.expenses(s.paperId)).toHaveLength(0);
    expect(await ctx.cs.settlements(s.paperId)).toHaveLength(0);
    expect(await ctx.cs.directRows(s.paperId)).toHaveLength(0);
    expect(await ctx.cs.depositRows(s.paperId)).toHaveLength(0);
    expect(await ctx.cs.paperToken(s.paperId)).toBe(tokenBefore);
  });

  it('S-07 any employee reads and edits any paper (no per-paper or per-route scoping, CS-1.3)', async () => {
    const s = await ctx.cs.scene();
    const other = await ctx.cs.scene();
    for (const paperId of [s.paperId, other.paperId]) {
      ok(await ctx.cs.get(paperId, ctx.tokens.emp2));
      const saved = ok(
        await ctx.cs.save(
          'expenses',
          paperId,
          [],
          await ctx.cs.paperToken(paperId),
          { token: ctx.tokens.emp2 },
        ),
      );
      expect(saved.success).toBe(true);
    }
  });

  it('S-08 paper id abc, 0, -1, 2147483648: 400 "Invalid id"; 007 is read as 7', async () => {
    const s = await ctx.cs.scene();
    for (const id of ['abc', '0', '-1', '2147483648']) {
      const g = await ctx.cs.get(id);
      expect(g.status, id).toBe(400);
      expect(g.body.message, id).toBe('Invalid id');
      expect(
        (await ctx.cs.save('expenses', id, [], null)).status,
        `save ${id}`,
      ).toBe(400);
    }
    ok(await ctx.cs.get(String(s.paperId).padStart(10, '0')));
  });
});

describe('Cash Settlement – throttle', () => {
  let ctx: CashCtx;
  beforeAll(async () => {
    ctx = await createCashTestContext({ throttle: true });
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.cs.cleanup();
  });

  it('S-05 the 11th save to one endpoint within 60 s is 429; other endpoints and other users are unaffected', async () => {
    const s = await ctx.cs.scene();
    const noop = async (section: 'expenses' | 'denominations', token: string) =>
      ctx.cs.save(section, s.paperId, [], await ctx.cs.paperToken(s.paperId), {
        token,
      });
    for (let i = 1; i <= 10; i++)
      expect((await noop('expenses', ctx.tokens.emp)).status, `call ${i}`).toBe(
        200,
      );
    expect((await noop('expenses', ctx.tokens.emp)).status).toBe(429);
    expect((await noop('denominations', ctx.tokens.emp)).status).toBe(200); // other endpoint, own bucket
    expect((await noop('expenses', ctx.tokens.emp2)).status).toBe(200); // other user
  });
});
