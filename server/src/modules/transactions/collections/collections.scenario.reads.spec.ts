/**
 * Collections – read endpoint (GET /collections/sheet/:sheetId).
 * Scenarios: S-10 .. S-26   (spec: CD-2.0, CD-3.x, CD-1.5, CD-6.2, I-2)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createCollectionsTestContext,
  entry,
  gridOf,
  leafFields,
  leaves,
  num,
  rowOf,
  uniq,
  type CollectionsCtx,
} from '../../../../test/helper/collections-harness.js';

const MISSING = 2000000000;

describe('Collections reads', () => {
  let ctx: CollectionsCtx;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  it('S-10 missing sheet → 404 "Order sheet not found"', async () => {
    const res = await ctx.col.get(MISSING);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Order sheet not found');
  });

  it('S-11 id abc / 0 / -1 / 2147483648 → 400 "Invalid id"; 007-style is accepted', async () => {
    const { sheet } = await ctx.world.scene();
    for (const bad of ['abc', '0', '-1', '2147483648']) {
      const r = await ctx.col.get(bad);
      expect(r.status, bad).toBe(400);
      expect(r.body.message).toBe('Invalid id');
    }
    expect((await ctx.col.get(`000${sheet.sheetId}`)).status).toBe(200);
  });

  it('S-12 never-saved sheet: both grids list all eligible clients with zeros, collectionId null, token null', async () => {
    const { sheet, clients } = await ctx.world.scene({ clients: 2 });
    const body = (await ctx.col.get(sheet.sheetId)).body;
    expect(body.collectionsUpdatedAt).toBeNull();
    for (const cat of ['MILK', 'NON_MILK'] as const) {
      for (const c of clients) {
        const r = rowOf(body, cat, c.id);
        expect(r, `${cat} ${c.id}`).toBeDefined();
        expect(r.collectionId).toBeNull();
        expect([
          r.officeCashCollection,
          r.cashCollection,
          r.chequeCollection,
          r.employeeTotal,
        ]).toEqual([0, 0, 0, 0]);
      }
    }
  });

  it('S-13 payload is exactly { sheet:{id, orderPaperId, groupId, groupName}, workflow, collectionsUpdatedAt, milk/nonMilk grids }', async () => {
    const { sheet, group } = await ctx.world.scene();
    const body = (await ctx.col.get(sheet.sheetId)).body;
    expect(Object.keys(body).sort()).toEqual([
      'collectionsUpdatedAt',
      'milkCollectionGrid',
      'nonMilkCollectionGrid',
      'sheet',
      'workflow',
    ]);
    expect(Object.keys(body.sheet).sort()).toEqual([
      'groupId',
      'groupName',
      'id',
      'orderPaperId',
    ]);
    expect(body.sheet).toEqual({
      id: sheet.sheetId,
      orderPaperId: sheet.paperId,
      groupId: group.id,
      groupName: group.name,
    });
  });

  it('S-14 an active, in-group, authorized client appears with no collection', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const r = rowOf((await ctx.col.get(sheet.sheetId)).body, 'MILK', c.id);
    expect(r).toBeDefined();
    expect(r.collectionId).toBeNull();
  });

  it('S-15 a client with a row stays visible after being deactivated / moved group / de-authorized', async () => {
    const {
      sheet,
      clients: [cDeact, cMoved, cDeauth],
    } = await ctx.world.scene({ clients: 3 });
    for (const c of [cDeact, cMoved, cDeauth])
      await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
        cash_collection: 10,
      });
    const other = await ctx.world.addGroup();
    await ctx.db.master_client.update({
      where: { id: cDeact.id },
      data: { is_active: false },
    });
    await ctx.db.master_client.update({
      where: { id: cMoved.id },
      data: { delivery_group_id: other.id },
    });
    await ctx.db.master_client_category.deleteMany({
      where: { client_id: cDeauth.id, category: 'MILK' },
    });
    const body = (await ctx.col.get(sheet.sheetId)).body;
    for (const c of [cDeact, cMoved, cDeauth]) {
      expect(rowOf(body, 'MILK', c.id), `client ${c.id}`).toBeDefined();
    }
  });

  it('S-16 category visibility: MILK-only client is in the milk grid only; a client buying both has independent rows', async () => {
    const { world } = ctx;
    const {
      sheet,
      group,
      clients: [both],
    } = await world.scene();
    const milkOnly = await world.addClient({
      group,
      categories: [{ category: 'MILK' as never, supplier: world.distA }],
    });
    await ctx.col.seedRow(sheet.sheetId, both.id, 'MILK', {
      cash_collection: 40,
    });
    const body = (await ctx.col.get(sheet.sheetId)).body;
    expect(rowOf(body, 'MILK', milkOnly.id)).toBeDefined();
    expect(rowOf(body, 'NON_MILK', milkOnly.id)).toBeUndefined();
    expect(rowOf(body, 'MILK', both.id).collectionId).not.toBeNull();
    expect(rowOf(body, 'NON_MILK', both.id).collectionId).toBeNull(); // independent
    expect(rowOf(body, 'NON_MILK', both.id).cashCollection).toBe(0);
  });

  it('S-17 totals per row (ADMIN): employee 350, admin 15, grand 365', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: 100,
      cash_collection: 200,
      cheque_collection: 50,
      online_collection: 10,
      bank_deposit: 5,
    });
    const r = rowOf(
      (await ctx.col.get(sheet.sheetId, ctx.tokens.admin)).body,
      'MILK',
      c.id,
    );
    expect([r.employeeTotal, r.adminTotal, r.grandTotal]).toEqual([
      350, 15, 365,
    ]);
  });

  it('S-18 grid totals are column sums plus totalClients', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 3 });
    await ctx.col.seedRow(sheet.sheetId, c1.id, 'MILK', {
      office_cash_collection: 10,
      cash_collection: 100,
    });
    await ctx.col.seedRow(sheet.sheetId, c2.id, 'MILK', {
      cash_collection: 50,
      cheque_collection: 5,
    });
    const t = gridOf(
      (await ctx.col.get(sheet.sheetId, ctx.tokens.admin)).body,
      'MILK',
    ).totals;
    expect(t).toMatchObject({
      totalClients: 3, // includes the client with zero amounts
      officeCashCollection: 10,
      cashCollection: 150,
      chequeCollection: 5,
      employeeTotal: 165,
    });
  });

  it('S-19 decimal totals are exact (0.1 + 0.2 = 0.3), 2dp', async () => {
    const {
      sheet,
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.col.seedRow(sheet.sheetId, c1.id, 'MILK', {
      cash_collection: 0.1,
    });
    await ctx.col.seedRow(sheet.sheetId, c2.id, 'MILK', {
      cash_collection: 0.2,
    });
    const t = gridOf((await ctx.col.get(sheet.sheetId)).body, 'MILK').totals;
    expect(t.cashCollection).toBe(0.3);
    expect(t.employeeTotal).toBe(0.3);
  });

  it('S-20 sorted by code then name; codeless clients last, by name', async () => {
    const { world } = ctx;
    const { sheet, group } = await world.scene();
    const u = uniq();
    const b2 = await world.addClient({ group, name: 'Yankee' });
    const a1 = await world.addClient({ group, name: 'Xray' });
    const zulu = await world.addClient({ group, name: 'Zulu' });
    const alpha = await world.addClient({ group, name: 'Alpha' });
    await ctx.col.setCode(a1.id, `${u}-A1`);
    await ctx.col.setCode(b2.id, `${u}-B2`);
    await ctx.col.setCode(zulu.id, null);
    await ctx.col.setCode(alpha.id, null);
    const mine = new Set([a1.id, b2.id, zulu.id, alpha.id]);
    const order = gridOf((await ctx.col.get(sheet.sheetId)).body, 'MILK')
      .rows.map((r: any) => r.clientId)
      .filter((id: number) => mine.has(id));
    expect(order).toEqual([a1.id, b2.id, alpha.id, zulu.id]);
  });

  it('S-21 natural, case-insensitive code order: C9, C10, c11', async () => {
    const { world } = ctx;
    const { sheet, group } = await world.scene();
    const u = uniq();
    const [c10, c11, c9] = [
      await world.addClient({ group, name: 'n1' }),
      await world.addClient({ group, name: 'n2' }),
      await world.addClient({ group, name: 'n3' }),
    ];
    await ctx.col.setCode(c10.id, `${u}-C10`);
    await ctx.col.setCode(c11.id, `${u}-c11`);
    await ctx.col.setCode(c9.id, `${u}-C9`);
    const mine = new Set([c9.id, c10.id, c11.id]);
    const order = gridOf((await ctx.col.get(sheet.sheetId)).body, 'MILK')
      .rows.map((r: any) => r.clientId)
      .filter((id: number) => mine.has(id));
    expect(order).toEqual([c9.id, c10.id, c11.id]);
  });

  it('S-22 ADMIN columns: Client Code, Client Name, Night, Morning, Total (Employee), Admin, Total (Admin), Grand Total', async () => {
    const { sheet } = await ctx.world.scene();
    const cols = gridOf(
      (await ctx.col.get(sheet.sheetId, ctx.tokens.admin)).body,
      'MILK',
    ).columns;
    // content and nesting are asserted exactly; group wording is matched by prefix (CD-3.7 gives no literal text, D-12)
    expect(leafFields(cols)).toEqual([
      'clientCode',
      'clientName',
      'officeCashCollection',
      'cashCollection',
      'chequeCollection',
      'employeeTotal',
      'onlineCollection',
      'bankDeposit',
      'adminTotal',
      'grandTotal',
    ]);
    const tops = cols.map((c: any) => c.headerName as string);
    expect(tops[0]).toMatch(/Client Code/);
    expect(tops[1]).toMatch(/Client Name/);
    expect(tops[2]).toMatch(/^Night/);
    expect(tops[3]).toMatch(/^Morning/);
    expect(tops[4]).toMatch(/Total \(Employee\)/);
    expect(tops[5]).toMatch(/^Admin/);
    expect(tops[6]).toMatch(/Total \(Admin\)/);
    expect(tops[7]).toMatch(/Grand Total/);
    expect(cols[2].children).toHaveLength(1);
    expect(cols[3].children).toHaveLength(2);
    expect(cols[5].children).toHaveLength(2);
    expect(
      leaves(cols).find((l) => l.field === 'onlineCollection')!.headerName,
    ).toMatch(/Online.*UPI/);
  });

  it('S-23 EMPLOYEE GET has no Online, Bank Deposit, Total (Admin), Grand Total in columns, rows or totals', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      online_collection: 10,
      bank_deposit: 5,
      cash_collection: 7,
    });
    const body = (await ctx.col.get(sheet.sheetId, ctx.tokens.emp)).body;
    const hidden = [
      'onlineCollection',
      'bankDeposit',
      'adminTotal',
      'grandTotal',
    ];
    for (const cat of ['MILK', 'NON_MILK'] as const) {
      const g = gridOf(body, cat);
      for (const f of hidden) {
        expect(leafFields(g.columns), `${cat} column ${f}`).not.toContain(f);
        expect(g.totals, `${cat} totals ${f}`).not.toHaveProperty(f);
        for (const r of g.rows)
          expect(r, `${cat} row ${f}`).not.toHaveProperty(f);
      }
    }
    expect(rowOf(body, 'MILK', c.id).cashCollection).toBe(7);
  });

  it('S-24 workflow.permissions match the status matrix for each paper status', async () => {
    const { sheet } = await ctx.world.scene();
    const matrix = {
      DRAFT: [true, false, false],
      NIGHT_SUBMITTED: [true, true, false],
      MORNING_SUBMITTED: [false, false, true],
      FINALIZED: [false, false, false],
      REOPENED: [true, true, true],
    } as const;
    for (const [status, [night, morning, admin]] of Object.entries(matrix)) {
      await ctx.setStatus(sheet, status as never);
      const wf = (await ctx.col.get(sheet.sheetId)).body.workflow;
      expect(wf.status, status).toBe(status);
      expect(wf.permissions, status).toMatchObject({
        canEditNightCollections: night,
        canEditMorningCollections: morning,
        canEditAdminCollections: admin,
      });
    }
  });

  it('S-25 a client zeroed after a save keeps its row: non-null collectionId and zeros (and stays if deactivated)', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [
      entry('night', c, 100),
    ]);
    await ctx.col.seed('night', 'MILK', sheet.sheetId, [entry('night', c, 0)]);
    await ctx.db.master_client.update({
      where: { id: c.id },
      data: { is_active: false },
    });
    const r = rowOf((await ctx.col.get(sheet.sheetId)).body, 'MILK', c.id);
    expect(r).toBeDefined();
    expect(r.collectionId).not.toBeNull();
    expect(num(r.officeCashCollection)).toBe(0);
  });

  it('S-26 GET is allowed in DRAFT, MORNING_SUBMITTED and FINALIZED', async () => {
    const { sheet } = await ctx.world.scene();
    for (const status of ['DRAFT', 'MORNING_SUBMITTED', 'FINALIZED'] as const) {
      await ctx.setStatus(sheet, status);
      expect((await ctx.col.get(sheet.sheetId)).status, status).toBe(200);
    }
  });
});
