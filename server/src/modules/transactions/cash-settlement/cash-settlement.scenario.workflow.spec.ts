/**
 * Cash Settlement – workflow gates.
 * Scenarios: S-50 .. S-52, S-54, S-55   (S-53 is a blocker, see the coverage map)
 * Spec: CS-2.1, CS-2.2, CS-2.3, CS-2.4, PA-18.4, PA-8.11
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  SECTIONS,
  ok,
  createCashTestContext,
  type CashCtx,
  type Section,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – workflow', () => {
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

  const cs = () => ctx.cs;

  // CS-2.1
  const allowed: Record<string, Section[]> = {
    DRAFT: [],
    NIGHT_SUBMITTED: ['expenses', 'denominations', 'direct', 'deposits'],
    MORNING_SUBMITTED: [],
    FINALIZED: [],
    REOPENED: ['expenses', 'denominations'],
  };

  for (const [status, sections] of Object.entries(allowed)) {
    it.each(SECTIONS)(`S-50 / S-51 / S-52 ${status}: %s`, async (section) => {
      const s = await cs().scene({ status });
      const res = await cs().save(
        section,
        s.paperId,
        [],
        await cs().paperToken(s.paperId),
      );
      if (sections.includes(section)) {
        expect(res.status).toBe(200);
        expect(res.body.changed).toBe(false);
      } else {
        // S-52 / S-55: one generic message that names neither the status nor the section
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(MSG.NOT_ALLOWED);
        expect(res.body.message).not.toContain(status);
        expect(res.body.message.toLowerCase()).not.toContain('expense');
      }
    });
  }

  it('S-52b a rejected save writes nothing and leaves the token alone', async () => {
    const s = await cs().scene({ status: 'FINALIZED' });
    const before = await cs().paperToken(s.paperId);
    const res = await cs().save(
      'expenses',
      s.paperId,
      [cs().changing('expenses', s)],
      before,
    );
    expect(res.status).toBe(400);
    expect(await cs().expenses(s.paperId)).toHaveLength(0);
    expect(await cs().paperToken(s.paperId)).toBe(before);
  });

  it('S-54 an admin revert reopens all four sections; a screen opened before the revert gets 409', async () => {
    const s = await cs().scene({ status: 'MORNING_SUBMITTED' });
    const staleToken = await cs().paperToken(s.paperId);
    for (const section of SECTIONS) {
      expect(
        (await cs().save(section, s.paperId, [], staleToken)).status,
        `${section} before revert`,
      ).toBe(400);
    }

    const revert = await ctx.call(
      'post',
      `/papers/${s.paperId}/revert-morning`,
      ctx.tokens.admin,
      { reason: 'fix cash' },
    );
    expect(revert.status, JSON.stringify(revert.body)).toBeLessThan(300);

    for (const section of SECTIONS) {
      const res = await cs().save(section, s.paperId, [], staleToken);
      expect(res.status, `${section} old screen`).toBe(409); // revert advanced updated_at (PA-8.11)
    }
    for (const section of SECTIONS) {
      ok(
        await cs().save(
          section,
          s.paperId,
          [],
          await cs().paperToken(s.paperId),
        ),
      );
    }
  });
});
