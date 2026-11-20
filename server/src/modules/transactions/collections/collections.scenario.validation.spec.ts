/**
 * Collections – save validation and token format (all six save endpoints).
 * Scenarios: S-30 .. S-48 (+ S-46b for defect D-16)   (spec: CD-2.1, CD-5.x, CD-9.1, CD-9.3, CD-9.7)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CATS,
  PHASES,
  PHASE_FIELDS,
  createCollectionsTestContext,
  entry,
  num,
  type CollectionsCtx,
  type Phase,
} from '../../../../test/helper/collections-harness.js';

describe('Collections save validation and token', () => {
  let ctx: CollectionsCtx;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  /** A scene whose paper is REOPENED, so all three phases accept saves. */
  async function openScene(clients = 1) {
    const s = await ctx.world.scene({ clients });
    await ctx.setStatus(s.sheet, 'REOPENED');
    return s;
  }
  const first = (p: Phase) => PHASE_FIELDS[p].db[0];

  it('S-30 expectedUpdatedAt omitted → 400 on each of the six endpoints', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    for (const cat of CATS) {
      for (const phase of PHASES) {
        const res = await ctx.col.save(
          phase,
          cat,
          sheet.sheetId,
          [entry(phase, c, 1, 1)],
          undefined,
        );
        expect(res.status, `${phase} ${cat}`).toBe(400);
      }
    }
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  it('S-31 never-set token + explicit null + one positive row → 200 with a new token, row created, token set once', async () => {
    for (const cat of CATS) {
      for (const phase of PHASES) {
        const {
          sheet,
          clients: [c],
        } = await openScene();
        const res = await ctx.col.save(
          phase,
          cat,
          sheet.sheetId,
          [entry(phase, c, 10, 5)],
          null,
        );
        expect(res.status, `${phase} ${cat}: ${JSON.stringify(res.body)}`).toBe(
          200,
        );
        expect(typeof res.body.collectionsUpdatedAt).toBe('string');
        expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(
          res.body.collectionsUpdatedAt,
        );
        expect(await ctx.col.row(sheet.sheetId, c.id, cat)).not.toBeNull();
      }
    }
  });

  it('S-32 token already set, explicit null → 409 stale', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 1)]);
    for (const phase of PHASES) {
      const res = await ctx.col.save(
        phase,
        'MILK',
        sheet.sheetId,
        [entry(phase, c, 2, 2)],
        null,
      );
      expect(res.status, phase).toBe(409);
    }
  });

  it('S-33 malformed token ("abc", 123, "") → 400', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    for (const bad of ['abc', 123, '']) {
      const res = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', c, 1)],
        bad as never,
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  it('S-34 date-only token (valid ISO-8601, never equal) → 409', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 1)]);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 2)],
      '2026-10-01',
    );
    expect(res.status).toBe(409);
  });

  it('S-35 amounts 1250, 1250.5, 1250.50 and 0 are accepted and stored as given', async () => {
    for (const phase of PHASES) {
      const {
        sheet,
        clients: [c],
      } = await openScene();
      const col = first(phase);
      for (const [v, stored] of [
        [1250, 1250],
        [1250.5, 1250.5],
        [1250.5, 1250.5], // 1250.50 is the same JSON number
        [0, 0],
      ] as const) {
        const res = await ctx.col.save(
          phase,
          'MILK',
          sheet.sheetId,
          [entry(phase, c, v)],
          await ctx.col.tokenOf(sheet.sheetId),
        );
        expect(res.status, `${phase} ${v}: ${JSON.stringify(res.body)}`).toBe(
          200,
        );
        expect(
          num((await ctx.col.row(sheet.sheetId, c.id))![col]),
          `${phase} ${v}`,
        ).toBe(stored);
      }
    }
  });

  it('S-36 amount 1250.555 → 400, never rounded', async () => {
    for (const phase of PHASES) {
      const {
        sheet,
        clients: [c],
      } = await openScene();
      const res = await ctx.col.save(
        phase,
        'MILK',
        sheet.sheetId,
        [entry(phase, c, 1250.555)],
        null,
      );
      expect(res.status, phase).toBe(400);
      expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    }
  });

  it('S-37 amount 10,000,000 is accepted; 10,000,000.01 → 400', async () => {
    for (const phase of PHASES) {
      const {
        sheet,
        clients: [c],
      } = await openScene();
      const over = await ctx.col.save(
        phase,
        'MILK',
        sheet.sheetId,
        [entry(phase, c, 10000000.01)],
        null,
      );
      expect(over.status, `${phase} over`).toBe(400);
      const ok = await ctx.col.save(
        phase,
        'MILK',
        sheet.sheetId,
        [entry(phase, c, 10000000)],
        null,
      );
      expect(ok.status, `${phase} at cap: ${JSON.stringify(ok.body)}`).toBe(
        200,
      );
      expect(num((await ctx.col.row(sheet.sheetId, c.id))![first(phase)])).toBe(
        10000000,
      );
    }
  });

  it('S-38 amount -1, "500", true, [] → 400', async () => {
    for (const phase of PHASES) {
      const {
        sheet,
        clients: [c],
      } = await openScene();
      for (const bad of [-1, '500', true, []]) {
        const res = await ctx.col.save(
          phase,
          'MILK',
          sheet.sheetId,
          [entry(phase, c, bad)],
          null,
        );
        expect(res.status, `${phase} ${JSON.stringify(bad)}`).toBe(400);
      }
      expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    }
  });

  it('S-39 amount null / "" / omitted is accepted and stored as 0 inside a submitted row', async () => {
    const {
      sheet,
      clients: [c1, c2, c3],
    } = await openScene(3);
    for (const [c, blank] of [
      [c1, null],
      [c2, ''],
      [c3, undefined],
    ] as const) {
      await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
        office_cash_collection: 100,
      });
      const res = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', c, blank)],
        await ctx.col.tokenOf(sheet.sheetId),
      );
      expect(res.status, JSON.stringify(blank)).toBe(200);
      expect(
        num((await ctx.col.row(sheet.sheetId, c.id))!.office_cash_collection),
      ).toBe(0);
    }
  });

  it('S-40 exponent-form amount 1e-7 → 400 precision error, not a 500', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 1e-7)],
      null,
    );
    expect(res.status).toBe(400);
  });

  it('S-41 entries [] with a matching token → 200, current token unchanged', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    const t = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 5),
    ]);
    for (const phase of PHASES) {
      const res = await ctx.col.save(phase, 'MILK', sheet.sheetId, [], t);
      expect(res.status, phase).toBe(200);
      expect(res.body.collectionsUpdatedAt).toBe(t);
    }
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(t);
  });

  it('S-42 entries [] with a stale token → 409', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 5)]);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [],
      '2020-01-01T00:00:00.000Z',
    );
    expect(res.status).toBe(409);
  });

  it('S-43 1000 entries are accepted; 1001 → 400', async () => {
    const { sheet } = await openScene();
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        clientId: i + 1,
        officeCashCollection: 0,
      }));
    // all-zero rows for clients without a row are ignored (CD-2.2), so 1000 of them are a plain no-op
    expect(
      (await ctx.col.save('night', 'MILK', sheet.sheetId, mk(1000), null))
        .status,
    ).toBe(200);
    expect(
      (await ctx.col.save('night', 'MILK', sheet.sheetId, mk(1001), null))
        .status,
    ).toBe(400);
  });

  it('S-44 entries omitted, null, or not an array → 400', async () => {
    const { sheet } = await openScene();
    for (const body of [
      { expectedUpdatedAt: null },
      { entries: null, expectedUpdatedAt: null },
      { entries: 'x', expectedUpdatedAt: null },
      { entries: {}, expectedUpdatedAt: null },
    ]) {
      expect(
        (await ctx.col.raw('night', 'MILK', sheet.sheetId, body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
  });

  it('S-45 clientId 0, -1, 1.5, "7", 2147483648 → 400', async () => {
    const { sheet } = await openScene();
    for (const bad of [0, -1, 1.5, '7', 2147483648]) {
      const res = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [{ clientId: bad, officeCashCollection: 1 }],
        null,
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('S-46 the same clientId twice (with amounts, or both blank) → 400 "Duplicate client entries found: <ids>…"', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    const expected = `Duplicate client entries found: ${c.id}. Each client can only appear once per save.`;
    for (const entries of [
      [entry('night', c, 5), entry('night', c, 6)],
      [entry('night', c), entry('night', c)],
    ]) {
      const res = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        entries,
        null,
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(expected);
    }
  });

  it('S-46b [defect D-16] an id sent three times is listed once in the duplicate message', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 1), entry('night', c, 2), entry('night', c, 3)],
      null,
    );
    expect(res.status).toBe(400);
    const listed =
      /found: (.*?)\. Each/.exec(String(res.body.message))?.[1].split(', ') ??
      [];
    expect(listed.length).toBeGreaterThan(0);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('S-47 duplicate client together with a stale token → 400 (validation before the token)', async () => {
    const {
      sheet,
      clients: [c],
    } = await openScene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 1)]);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 5), entry('night', c, 6)],
      '2020-01-01T00:00:00.000Z',
    );
    expect(res.status).toBe(400);
  });

  it('S-48 duplicate client for a missing sheet → 400 (before the sheet lookup)', async () => {
    const res = await ctx.col.save(
      'night',
      'MILK',
      2000000000,
      [entry('night', 1, 5), entry('night', 1, 6)],
      null,
    );
    expect(res.status).toBe(400);
  });
});
