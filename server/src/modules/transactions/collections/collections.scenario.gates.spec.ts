/**
 * Collections – submission / finalization gates and cross-module behavior.
 * Scenarios: S-110 .. S-117, S-122, S-123   (S-120 and S-121 blocked, see coverage map)
 * (spec: CD-1.4, CD-1.5, CD-10.1, CD-10.2, PA-6.4, PA-7.2, PA-8.3, PA-8.6, PA-20.2)
 *
 * The gates are not HTTP endpoints of Collections; Paper calls them. S-110..S-115 call
 * CollectionsValidationService directly against the real test database. The "b" variants and S-116 / S-117
 * observe the same gates through the Paper endpoints (readiness, submit-night).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CollectionsValidationService } from './services/collections-validation.service.js';
import { n } from '../../../../test/helper/orders-harness.js';
import {
  createCollectionsTestContext,
  entry,
  type CollectionsCtx,
} from '../../../../test/helper/collections-harness.js';

describe('Collections gates and cross-module behavior', () => {
  let ctx: CollectionsCtx;
  let gates: CollectionsValidationService;
  beforeAll(async () => {
    ctx = await createCollectionsTestContext();
    gates = ctx.app.get(CollectionsValidationService, { strict: false });
  });
  afterAll(() => ctx.close());
  afterEach(() => ctx.world.deletePapers());

  const db = () => ctx.prisma as never;
  const readiness = async (paperId: number) =>
    (await ctx.call('get', `/papers/${paperId}/readiness`, ctx.tokens.emp))
      .body;
  const NEG = {
    office: 'Office cash collection cannot be negative',
    cash: 'Cash collection cannot be negative',
    cheque: 'Cheque collection cannot be negative',
    online: 'Online collection cannot be negative',
    bank: 'Bank deposit cannot be negative',
  };

  it('S-110 night gate: a sheet with no collection rows passes (all three gates)', async () => {
    const { sheet } = await ctx.world.scene();
    await expect(
      gates.validateNightCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await expect(
      gates.validateMorningCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await expect(
      gates.validateAdminCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
  });

  it('S-111 night, morning and finalize gates pass when some clients are blank (no completeness rule)', async () => {
    const {
      sheet,
      clients: [c1],
    } = await ctx.world.scene({ clients: 3 });
    await ctx.col.seedRow(sheet.sheetId, c1.id, 'MILK', {
      office_cash_collection: 10,
    }); // the others have no row
    await expect(
      gates.validateNightCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await expect(
      gates.validateMorningCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await expect(
      gates.validateAdminCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
  });

  it('S-112 [DB seam] stored negative office cash → night gate rejects with "Office cash collection cannot be negative"', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: -5,
    });
    await expect(
      gates.validateNightCollections(sheet.sheetId, db()),
    ).rejects.toMatchObject({ status: 400, message: NEG.office });
  });

  it('S-112b DRAFT readiness lists the negative office cash with the sheet prefix', async () => {
    const {
      sheet,
      group,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: -5,
    });
    const r = await readiness(sheet.paperId);
    expect(r.action).toBe('SUBMIT_NIGHT');
    expect(r.problems).toContain(`Sheet "${group.name}": ${NEG.office}`);
  });

  it('S-113 [DB seam] stored negative cash or cheque → morning gate rejects and names the column', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', { cash_collection: -5 });
    await expect(
      gates.validateMorningCollections(sheet.sheetId, db()),
    ).rejects.toMatchObject({ status: 400, message: NEG.cash });
    await ctx.db.client_collection.updateMany({
      where: { order_sheet_id: sheet.sheetId },
      data: { cash_collection: 0, cheque_collection: -5 },
    });
    await expect(
      gates.validateMorningCollections(sheet.sheetId, db()),
    ).rejects.toMatchObject({ status: 400, message: NEG.cheque });
  });

  it('S-113b NIGHT_SUBMITTED readiness lists the negative cash with the sheet prefix', async () => {
    const {
      sheet,
      group,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', { cash_collection: -5 });
    const r = await readiness(sheet.paperId);
    expect(r.action).toBe('SUBMIT_MORNING');
    expect(r.problems).toContain(`Sheet "${group.name}": ${NEG.cash}`);
  });

  it('S-114 [DB seam] stored negative online or bank deposit → admin gate rejects', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      online_collection: -5,
    });
    await expect(
      gates.validateAdminCollections(sheet.sheetId, db()),
    ).rejects.toMatchObject({ status: 400, message: NEG.online });
    await ctx.db.client_collection.updateMany({
      where: { order_sheet_id: sheet.sheetId },
      data: { online_collection: 0, bank_deposit: -5 },
    });
    await expect(
      gates.validateAdminCollections(sheet.sheetId, db()),
    ).rejects.toMatchObject({ status: 400, message: NEG.bank });
  });

  it('S-114b MORNING_SUBMITTED readiness (finalize) lists the negative online amount with the sheet prefix', async () => {
    const {
      sheet,
      group,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.setStatus(sheet, 'MORNING_SUBMITTED');
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      online_collection: -5,
    });
    const r = await readiness(sheet.paperId);
    expect(r.action).toBe('FINALIZE');
    expect(r.problems).toContain(`Sheet "${group.name}": ${NEG.online}`);
  });

  it('S-115 a negative in another phase’s column does not block this phase’s gate', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: -5,
    });
    await expect(
      gates.validateMorningCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await expect(
      gates.validateAdminCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await ctx.db.client_collection.updateMany({
      where: { order_sheet_id: sheet.sheetId },
      data: { office_cash_collection: 0, cash_collection: -5 },
    });
    await expect(
      gates.validateNightCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
    await expect(
      gates.validateAdminCollections(sheet.sheetId, db()),
    ).resolves.toBeUndefined();
  });

  it('S-116 re-finalize of a REOPENED paper runs the morning gate and the admin gate again', async () => {
    const {
      sheet,
      group,
      clients: [c1, c2],
    } = await ctx.world.scene({ clients: 2 });
    await ctx.setStatus(sheet, 'REOPENED');
    await ctx.col.seedRow(sheet.sheetId, c1.id, 'MILK', {
      cash_collection: -5,
    });
    await ctx.col.seedRow(sheet.sheetId, c2.id, 'MILK', {
      online_collection: -5,
    });
    const r = await readiness(sheet.paperId);
    expect(r.action).toBe('FINALIZE');
    expect(r.problems).toEqual(
      expect.arrayContaining([
        `Sheet "${group.name}": ${NEG.cash}`,
        `Sheet "${group.name}": ${NEG.online}`,
      ]),
    );
  });

  it('S-117 a Collections failure together with other modules failing is reported in one 400 details[]; nothing changes', async () => {
    const {
      sheet,
      group,
      clients: [c],
    } = await ctx.world.scene();
    await ctx.col.seedRow(sheet.sheetId, c.id, 'MILK', {
      office_cash_collection: -5,
    });
    const res = await ctx.call(
      'post',
      `/papers/${sheet.paperId}/submit-night`,
      ctx.tokens.emp,
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Night submission is not ready');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        `No orders entered for sheet "${group.name}". Please enter at least one order before submitting.`, // Orders
        `Sheet "${group.name}": ${NEG.office}`, // Collections
      ]),
    );
    const paper = await ctx.db.order_paper.findUniqueOrThrow({
      where: { id: sheet.paperId },
    });
    expect(paper.status).toBe('DRAFT');
  });

  it('S-122 a collected amount larger than the client’s bill is accepted (Collections never reads bills)', async () => {
    const {
      sheet,
      products: [p],
      clients: [c],
    } = await ctx.world.scene();
    await ctx.seedNight(sheet, [n(c, p, 1)]); // small bill
    await ctx.setStatus(sheet, 'NIGHT_SUBMITTED');
    const res = await ctx.col.save(
      'morning',
      'MILK',
      sheet.sheetId,
      [entry('morning', c, 9999999, 0)],
      null,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(
      Number((await ctx.col.row(sheet.sheetId, c.id))!.cash_collection),
    ).toBe(9999999);
  });

  it('S-123 an employee collections save writes no audit row (Paper actions only are audited)', async () => {
    const {
      sheet,
      clients: [c],
    } = await ctx.world.scene();
    const before = await ctx.db.paper_audit_log.count({
      where: { order_paper_id: sheet.paperId },
    });
    expect(
      (
        await ctx.col.save(
          'night',
          'MILK',
          sheet.sheetId,
          [entry('night', c, 10)],
          null,
        )
      ).status,
    ).toBe(200);
    expect(
      await ctx.db.paper_audit_log.count({
        where: { order_paper_id: sheet.paperId },
      }),
    ).toBe(before);
  });
});
