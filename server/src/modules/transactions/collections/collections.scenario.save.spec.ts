/**
 * Collections – save mechanics and business rules.
 * Scenarios: S-60 .. S-80, S-130, S-131, S-137
 * (spec: CD-2.1, CD-2.2, CD-3.8, CD-4.x, CD-6.x, CD-9.4, CD-11.1)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CATS,
  NOT_IN_CATEGORY,
  PHASES,
  SUCCESS_MESSAGE,
  createCollectionsTestContext,
  entry,
  num,
  type CollectionsCtx,
} from '../../../../test/helper/collections-harness.js';

describe('Collections save mechanics', () => {
  let ctx: CollectionsCtx;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const REOPENED = async (clients = 2) => {
    const s = await ctx.world.scene({ clients });
    await ctx.setStatus(s.sheet, 'REOPENED');
    return s;
  };

  it('S-60 night save, new client, office 100 → row created, other columns 0, token set once', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 100)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    const r = (await ctx.col.row(sheet.sheetId, c.id, 'MILK'))!;
    expect(
      [
        r.office_cash_collection,
        r.cash_collection,
        r.cheque_collection,
        r.online_collection,
        r.bank_deposit,
      ].map(num),
    ).toEqual([100, 0, 0, 0, 0]);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(
      res.body.collectionsUpdatedAt,
    );
  });

  it('S-61 night save, new client, all amounts blank or 0 → 200, no row, token unchanged', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c1, 0), entry('night', c2)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.collectionsUpdatedAt).toBeNull();
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-62 existing row, submitted values equal stored → 200, token unchanged, nothing written', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const t = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 100),
    ]);
    const before = (await ctx.col.row(
      sheet.sheetId,
      c.id,
    ))!.updated_at.getTime();
    await sleep(25);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 100)],
      t,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.collectionsUpdatedAt).toBe(t);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(t);
    expect((await ctx.col.row(sheet.sheetId, c.id))!.updated_at.getTime()).toBe(
      before,
    );
  });

  it('S-63 existing row, one value differs → updated, token advances once, other phases untouched', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 100),
    ]);
    const t = await ctx.col.seed('morning', 'MILK', sheet.sheetId, [
      entry('morning', c, 200, 50),
    ]);
    const before = (await ctx.col.row(
      sheet.sheetId,
      c.id,
    ))!.updated_at.getTime();
    await sleep(25);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 120)],
      t,
    );
    expect(res.status, body(res)).toBe(200);
    expect(new Date(res.body.collectionsUpdatedAt).getTime()).toBeGreaterThan(
      new Date(t!).getTime(),
    );
    const r = (await ctx.col.row(sheet.sheetId, c.id))!;
    expect([
      num(r.office_cash_collection),
      num(r.cash_collection),
      num(r.cheque_collection),
    ]).toEqual([120, 200, 50]);
    expect(r.updated_at.getTime()).toBeGreaterThan(before);
  });

  it('S-64 morning row with only cashCollection 300 sets cheque to 0 (blank = 0 inside a submitted row)', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const t = await ctx.col.seed('morning', 'MILK', sheet.sheetId, [
      entry('morning', c, 200, 50),
    ]);
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [{ clientId: c.id, cashCollection: 300 }],
      t,
    );
    expect(res.status, body(res)).toBe(200);
    const r = (await ctx.col.row(sheet.sheetId, c.id))!;
    expect([num(r.cash_collection), num(r.cheque_collection)]).toEqual([
      300, 0,
    ]);
  });

  it('S-65 morning row writes cash and cheque; office, online, bank untouched', async () => {
    const {
      sheet,
      clients: [c],
    } = await REOPENED(1);
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: 7,
      online_collection: 8,
      bank_deposit: 9,
    });
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 30, 20)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    const r = (await ctx.col.row(sheet.sheetId, c.id))!;
    expect(
      [
        r.cash_collection,
        r.cheque_collection,
        r.office_cash_collection,
        r.online_collection,
        r.bank_deposit,
      ].map(num),
    ).toEqual([30, 20, 7, 8, 9]);
  });

  it('S-66 admin row writes online and bank; office, cash, cheque untouched', async () => {
    const {
      sheet,
      clients: [c],
    } = await REOPENED(1);
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: 7,
      cash_collection: 8,
      cheque_collection: 9,
    });
    const res = await ctx.col.save(
      'admin',
      'MILK',
      sheet.sheetId,
      [entry('admin', c, 30, 20)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    const r = (await ctx.col.row(sheet.sheetId, c.id))!;
    expect(
      [
        r.online_collection,
        r.bank_deposit,
        r.office_cash_collection,
        r.cash_collection,
        r.cheque_collection,
      ].map(num),
    ).toEqual([30, 20, 7, 8, 9]);
  });

  it('S-67 a request naming 2 of 5 clients leaves the other 3 untouched', async () => {
    const { sheet, clients } = await REOPENED(5);
    for (const c of clients)
      await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
        office_cash_collection: 10,
      });
    const snapshot = new Map(
      (await ctx.col.rows(sheet.sheetId)).map((r) => [
        r.client_id,
        r.updated_at.getTime(),
      ]),
    );
    await sleep(25);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', clients[0], 99), entry('night', clients[1], 98)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    for (const c of clients.slice(2)) {
      const r = (await ctx.col.row(sheet.sheetId, c.id))!;
      expect(num(r.office_cash_collection)).toBe(10);
      expect(r.updated_at.getTime()).toBe(snapshot.get(c.id));
    }
  });

  it('S-68 mixed request (1 unchanged, 1 changed, 1 new positive, 1 new all-zero) → exactly 2 rows written, token advances once', async () => {
    const {
      sheet,
      clients: [c1, c2, c3, c4],
    } = await REOPENED(4);
    await ctx.col.seedRow(sheet.sheetId, c1.id, 'MILK', {
      office_cash_collection: 10,
    });
    await ctx.col.seedRow(sheet.sheetId, c2.id, 'MILK', {
      office_cash_collection: 20,
    });
    const before1 = (await ctx.col.row(
      sheet.sheetId,
      c1.id,
    ))!.updated_at.getTime();
    const before2 = (await ctx.col.row(
      sheet.sheetId,
      c2.id,
    ))!.updated_at.getTime();
    await sleep(25);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [
        entry('night', c1, 10),
        entry('night', c2, 25),
        entry('night', c3, 30),
        entry('night', c4, 0),
      ],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.changed).toBe(true);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(3); // c4 never created
    expect(
      (await ctx.col.row(sheet.sheetId, c1.id))!.updated_at.getTime(),
    ).toBe(before1);
    const r2 = (await ctx.col.row(sheet.sheetId, c2.id))!;
    expect(num(r2.office_cash_collection)).toBe(25);
    expect(r2.updated_at.getTime()).toBeGreaterThan(before2);
    expect(
      num((await ctx.col.row(sheet.sheetId, c3.id))!.office_cash_collection),
    ).toBe(30);
    expect(await ctx.col.row(sheet.sheetId, c4.id)).toBeNull();
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBe(
      res.body.collectionsUpdatedAt,
    );
  });

  it('S-69 existing row set to all zeros → row kept with zeros; counts as a change', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const t = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 100),
    ]);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 0)],
      t,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.collectionsUpdatedAt).not.toBe(t);
    expect(
      num((await ctx.col.row(sheet.sheetId, c.id))!.office_cash_collection),
    ).toBe(0);
  });

  it('S-70 new positive row for an inactive / other-group / unauthorized / unknown client → 400, whole request fails, token rolled back', async () => {
    const { world } = ctx;
    const {
      sheet,
      group,
      clients: [ok, inactive],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.db.master_client.update({
      where: { id: inactive.id },
      data: { is_active: false },
    });
    const foreign = await world.addClient({ group: await world.addGroup() });
    const noCategory = await world.addClient({ group, categories: [] });
    for (const bad of [inactive.id, foreign.id, noCategory.id, 2000000000]) {
      const res = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        [entry('night', ok, 50), entry('night', bad, 10)],
        null,
      );
      expect(res.status, `client ${bad}`).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        NOT_IN_CATEGORY(bad, 'MILK'),
      );
    }
    const nm = await ctx.col.save(
      'night',
      'NON_MILK',
      sheet.sheetId,
      [entry('night', inactive, 10)],
      null,
    );
    expect(JSON.stringify(nm.body.message)).toContain(
      NOT_IN_CATEGORY(inactive.id, 'NON_MILK'),
    );
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-71 same as S-70 but the row is all-zero → 200, no row, token unchanged, no client rule applied', async () => {
    const { world } = ctx;
    const {
      sheet,
      group,
      clients: [inactive],
    } = await ctx.world.scene();
    await ctx.db.master_client.update({
      where: { id: inactive.id },
      data: { is_active: false },
    });
    const foreign = await world.addClient({ group: await world.addGroup() });
    const noCategory = await world.addClient({ group, categories: [] });
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [inactive, foreign, noCategory]
        .map((c) => entry('night', c, 0))
        .concat([entry('night', 2000000000, 0)]),
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-72 a client that already has a row stays updatable after deactivation / group move / de-authorization', async () => {
    const {
      sheet,
      clients: [cDeact, cMoved, cDeauth],
    } = await ctx.world.scene({ clients: 3 });
    for (const c of [cDeact, cMoved, cDeauth])
      await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
        office_cash_collection: 10,
      });
    await ctx.db.master_client.update({
      where: { id: cDeact.id },
      data: { is_active: false },
    });
    await ctx.db.master_client.update({
      where: { id: cMoved.id },
      data: { delivery_group_id: (await ctx.world.addGroup()).id },
    });
    await ctx.db.master_client_category.deleteMany({
      where: { client_id: cDeauth.id, category: 'MILK' },
    });
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [cDeact, cMoved, cDeauth].map((c) => entry('night', c, 77)),
      null,
    );
    expect(res.status, body(res)).toBe(200);
    for (const c of [cDeact, cMoved, cDeauth])
      expect(
        num((await ctx.col.row(sheet.sheetId, c.id))!.office_cash_collection),
      ).toBe(77);
  });

  it('S-73 one bad row among several → whole request fails, nothing saved, token unchanged', async () => {
    const { sheet, clients } = await ctx.world.scene({ clients: 5 });
    const entries = [
      ...clients.map((c) => entry('night', c, 10)),
      entry('night', 2000000000, 10),
    ];
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      entries,
      null,
    );
    expect(res.status).toBe(400);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
    expect(await ctx.col.tokenOf(sheet.sheetId)).toBeNull();
  });

  it('S-74 a milk save leaves the same client’s NON_MILK row untouched', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'NON_MILK', {
      office_cash_collection: 5,
    });
    const before = (await ctx.col.row(
      sheet.sheetId,
      c.id,
      'NON_MILK',
    ))!.updated_at.getTime();
    await sleep(25);
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 99)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    const nm = (await ctx.col.row(sheet.sheetId, c.id, 'NON_MILK'))!;
    expect(num(nm.office_cash_collection)).toBe(5);
    expect(nm.updated_at.getTime()).toBe(before);
  });

  it('S-75 a client buying both categories has two independent rows per sheet', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 10)]);
    await ctx.col.seed('night', 'NON_MILK', sheet.sheetId, [
      entry('night', c, 20),
    ]);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(2);
    expect(
      num(
        (await ctx.col.row(sheet.sheetId, c.id, 'MILK'))!
          .office_cash_collection,
      ),
    ).toBe(10);
    expect(
      num(
        (await ctx.col.row(sheet.sheetId, c.id, 'NON_MILK'))!
          .office_cash_collection,
      ),
    ).toBe(20);
  });

  it('S-76 an entry carrying another phase’s field → 400 (a phase cannot write another phase’s columns)', async () => {
    const {
      sheet,
      clients: [c],
    } = await REOPENED(1);
    const cross: [(typeof PHASES)[number], Record<string, number>][] = [
      ['night', { onlineCollection: 1 }],
      ['night', { cashCollection: 1 }],
      ['morning', { officeCashCollection: 1 }],
      ['morning', { bankDeposit: 1 }],
      ['admin', { cashCollection: 1 }],
      ['admin', { officeCashCollection: 1 }],
    ];
    for (const [phase, extra] of cross) {
      const res = await ctx.col.save(
        phase,
        'MILK',
        sheet.sheetId,
        [{ ...entry(phase, c, 1, 1), ...extra }],
        null,
      );
      expect(res.status, `${phase} + ${Object.keys(extra)[0]}`).toBe(400);
    }
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });

  it('S-77 successful ADMIN save: 200, { success, changed, message, collectionsUpdatedAt, totals } for the saved category only', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await REOPENED(2);
    await ctx.col.seedRow(sheet.sheetId, c2.id, 'NON_MILK', {
      online_collection: 500,
    });
    const res = await ctx.col.save(
      'admin',
      'MILK',
      sheet.sheetId,
      [entry('admin', c1, 100, 20)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'changed',
      'collectionsUpdatedAt',
      'message',
      'success',
      'totals',
    ]);
    expect(res.body).toMatchObject({
      success: true,
      changed: true,
      message: SUCCESS_MESSAGE.admin,
    });
    expect(res.body.collectionsUpdatedAt).toBe(
      await ctx.col.tokenOf(sheet.sheetId),
    );
    expect(res.body.totals).toMatchObject({
      onlineCollection: 100,
      bankDeposit: 20,
      adminTotal: 120,
      grandTotal: 120,
    }); // not 600: milk only
  });

  it('S-78 the same save by an EMPLOYEE omits online, bank, adminTotal and grandTotal from totals', async () => {
    const {
      sheet,
      clients: [c],
    } = await REOPENED(1);
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      online_collection: 9,
      bank_deposit: 9,
    });
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 10, 5)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    for (const f of [
      'onlineCollection',
      'bankDeposit',
      'adminTotal',
      'grandTotal',
    ])
      expect(res.body.totals).not.toHaveProperty(f);
    expect(res.body.totals).toMatchObject({
      cashCollection: 10,
      chequeCollection: 5,
      employeeTotal: 15,
    });
    expect(res.body.message).toBe(SUCCESS_MESSAGE.morning);
  });

  it('S-79 totals are rebuilt from stored data, including rows not in the request', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await REOPENED(2);
    await ctx.col.seedRow(sheet.sheetId, c2.id, 'MILK', {
      cash_collection: 100,
    });
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c1, 50, 0)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.totals).toMatchObject({
      cashCollection: 150,
      chequeCollection: 0,
      employeeTotal: 150,
    });
  });

  it('S-80 no-op save (equal values or empty entries) → changed false and the unchanged current token', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const t = await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 100),
    ]);
    for (const entries of [[entry('night', c, 100)], []]) {
      const res = await ctx.col.save(
        'night',
        'MILK',
        sheet.sheetId,
        entries,
        t,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body.changed).toBe(false);
      expect(res.body.collectionsUpdatedAt).toBe(t);
    }
  });

  it('S-130 every one of the six saves answers 200, not 201', async () => {
    for (const cat of CATS) {
      for (const phase of PHASES) {
        const {
          sheet,
          clients: [c],
        } = await REOPENED(1);
        const res = await ctx.col.save(
          phase,
          cat,
          sheet.sheetId,
          [entry(phase, c, 1, 1)],
          null,
        );
        expect(res.status, `${phase} ${cat}`).toBe(200);
      }
    }
  });

  it('S-131 a save that changes data returns changed: true; a no-op returns changed: false', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const a = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 5)],
      null,
    );
    expect(a.body.changed).toBe(true);
    const b = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', c, 5)],
      a.body.collectionsUpdatedAt,
    );
    expect(b.body.changed).toBe(false);
  });

  it('S-137 an all-zero row for a nonexistent client id → 200 no-op, no error', async () => {
    const { sheet } = await ctx.world.scene();
    const res = await ctx.col.save(
      'night',
      'MILK',
      sheet.sheetId,
      [entry('night', 2000000000, 0)],
      null,
    );
    expect(res.status, body(res)).toBe(200);
    expect(res.body.changed).toBe(false);
    expect(await ctx.col.rows(sheet.sheetId)).toHaveLength(0);
  });
});
