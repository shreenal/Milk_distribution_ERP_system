/**
 * Collections – workflow gates.
 * Scenarios: S-50 .. S-57, S-59   (S-58 blocked, see coverage map)
 * (spec: CD-2.0, CD-2.3, CD-3.2, CD-6.4, PA-18)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_NOT_ALLOWED,
  CATS,
  MORNING_NOT_ALLOWED,
  NIGHT_NOT_ALLOWED,
  PHASES,
  createCollectionsTestContext,
  entry,
  type CollectionsCtx,
  type Phase,
} from '../../../../test/helper/collections-harness.js';

type Status =
  'DRAFT' | 'NIGHT_SUBMITTED' | 'MORNING_SUBMITTED' | 'FINALIZED' | 'REOPENED';

describe('Collections workflow gates', () => {
  let ctx: CollectionsCtx;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  const allowed: Record<Phase, Status[]> = {
    night: ['DRAFT', 'NIGHT_SUBMITTED', 'REOPENED'],
    morning: ['NIGHT_SUBMITTED', 'REOPENED'],
    admin: ['MORNING_SUBMITTED', 'REOPENED'],
  };
  const all: Status[] = [
    'DRAFT',
    'NIGHT_SUBMITTED',
    'MORNING_SUBMITTED',
    'FINALIZED',
    'REOPENED',
  ];
  const message = (phase: Phase, status: Status) =>
    phase === 'night'
      ? NIGHT_NOT_ALLOWED
      : phase === 'admin'
        ? ADMIN_NOT_ALLOWED
        : MORNING_NOT_ALLOWED(status);

  async function check(phase: Phase, status: Status, shouldWork: boolean) {
    for (const cat of CATS) {
      const {
        sheet,
        clients: [c],
      } = await ctx.world.scene();
      await ctx.setStatus(sheet, status);
      const res = await ctx.col.save(
        phase,
        cat,
        sheet.sheetId,
        [entry(phase, c, 10, 5)],
        null,
      );
      if (shouldWork) {
        expect(
          res.status,
          `${phase} ${cat} ${status}: ${JSON.stringify(res.body)}`,
        ).toBe(200);
        expect(await ctx.col.row(sheet.sheetId, c.id, cat)).not.toBeNull();
      } else {
        expect(res.status, `${phase} ${cat} ${status}`).toBe(400);
        expect(res.body.message).toBe(message(phase, status));
        expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
        expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
      }
    }
  }

  it('S-50 night save is allowed in DRAFT, NIGHT_SUBMITTED, REOPENED', async () => {
    for (const s of allowed.night) await check('night', s, true);
  });

  it('S-51 night save in MORNING_SUBMITTED / FINALIZED → 400 with the night message', async () => {
    for (const s of all.filter((x) => !allowed.night.includes(x)))
      await check('night', s, false);
  });

  it('S-52 morning save is allowed in NIGHT_SUBMITTED, REOPENED', async () => {
    for (const s of allowed.morning) await check('morning', s, true);
  });

  it('S-53 morning save in DRAFT / MORNING_SUBMITTED / FINALIZED → 400 naming the status', async () => {
    for (const s of all.filter((x) => !allowed.morning.includes(x)))
      await check('morning', s, false);
  });

  it('S-54 admin save is allowed in MORNING_SUBMITTED, REOPENED', async () => {
    for (const s of allowed.admin) await check('admin', s, true);
  });

  it('S-55 admin save in DRAFT / NIGHT_SUBMITTED / FINALIZED → 400 with the admin message', async () => {
    for (const s of all.filter((x) => !allowed.admin.includes(x)))
      await check('admin', s, false);
  });

  it('S-56 wrong status together with a stale token → 400 (status is checked before the token)', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 1)]); // token now set
    await ctx.setStatus(sheet, 'FINALIZED');
    for (const phase of PHASES) {
      const res = await ctx.col.save(
        phase,
        'MILK',
        sheet.sheetId,
        [entry(phase, c, 5, 5)],
        '2020-01-01T00:00:00.000Z',
      );
      expect(res.status, phase).toBe(400);
    }
  });

  it('S-57 missing sheet on any save → 404 "Order sheet not found" (before any status check)', async () => {
    for (const cat of CATS) {
      for (const phase of PHASES) {
        const res = await ctx.col.save(
          phase,
          cat,
          2000000000,
          [entry(phase, 1, 1, 1)],
          null,
        );
        expect(res.status, `${phase} ${cat}`).toBe(404);
        expect(res.body.message).toBe('Order sheet not found');
      }
    }
  });

  it('S-59 admin reverts MORNING_SUBMITTED to NIGHT_SUBMITTED: morning saves open again, admin saves close', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'MORNING_SUBMITTED');
    expect(
      (
        await ctx.col.save(
          'morning',
          'MILK',
          sheet.sheetId,
          [entry('morning', c, 1, 1)],
          null,
        )
      ).status,
    ).toBe(400);

    const revert = await ctx.call(
      'post',
      `/papers/${sheet.paperId}/revert-morning`,
      ctx.tokens.admin,
      {
        reason: 'collections test: correction needed',
      },
    );
    expect(revert.status, JSON.stringify(revert.body)).toBeLessThan(300);

    const morning = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 10, 5)],
      null,
    );
    expect(morning.status, JSON.stringify(morning.body)).toBe(200);
    const admin = await ctx.col.save(
      'admin',
      'MILK',
      sheet.sheetId,
      [entry('admin', c, 1, 1)],
      morning.body.collectionsUpdatedAt,
    );
    expect(admin.status).toBe(400);
    expect(admin.body.message).toBe(ADMIN_NOT_ALLOWED);
  });
});
