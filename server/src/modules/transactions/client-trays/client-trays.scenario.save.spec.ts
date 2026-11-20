/**
 * Client Trays – save / reconcile: request validation, token, balance and ledger rules, no-op saves.
 * Scenarios: T-30 .. T-63, T-140 .. T-147, T-153
 * (spec: CT-4.x, CT-5.x, CT-6.2, CT-7.x, CT-8.4, CT-9.x, CT-13)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createOrdersTestContext,
  iso,
  n,
  sleep,
  type OrdersCtx,
} from '../../../../test/helper/orders-harness.js';
import {
  DISCREPANCY,
  STALE,
  addDays,
  cleanupTrayTests,
  extraTrayType,
  outboxOf,
  ret,
  seedLedger,
  setTrayActive,
  sheetWithOpening,
  submittedWithTrays,
  traysApi,
  trayToken,
  tt,
  twoTraySheet,
  utc,
} from '../../../../test/helper/client-trays-helpers.js';
import { ClientTraysValidationService } from './services/client-trays-validation.service.js';

describe('Client Trays save', () => {
  let ctx: OrdersCtx;
  let api: ReturnType<typeof traysApi>;
  beforeAll(async () => {
    ctx = await createOrdersTestContext();
    api = traysApi(ctx);
  });
  afterAll(() => ctx.close());
  afterEach(() => cleanupTrayTests(ctx));

  const body = (r: { body: any }) => JSON.stringify(r.body);
  const D = utc(2095, 4, 12);
  const stored = async (sheetId: number) => ctx.trayRows(sheetId);

  // ------------------------------------------------------------------ C3
  describe('request validation and token', () => {
    it('T-30 empty token, valid entry, explicit null → 200 with the new token; ledger written, token set once', async () => {
      const s = await submittedWithTrays(ctx, { qty: 5 });
      const [c] = s.clients;
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 1)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Tray returns saved successfully',
      });
      expect(typeof res.body.clientTraysUpdatedAt).toBe('string');
      expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
        res.body.clientTraysUpdatedAt,
      );
      const rows = await stored(s.sheet.sheetId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        opening_balance: 0,
        trays_taken: 5,
        trays_returned: 1,
        closing_balance: 4,
      });
    });

    it('T-31 expectedUpdatedAt omitted → 400 on save and on reconcile', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      expect(
        (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], undefined))
          .status,
      ).toBe(400);
      expect(
        (
          await api.reconcile(
            s.sheet.sheetId,
            [ret(c.id, tt(ctx), 1)],
            undefined,
          )
        ).status,
      ).toBe(400);
      expect((await stored(s.sheet.sheetId))[0].trays_returned).toBe(0);
      expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
    });

    it('T-32 token already set, explicit null → 409 stale message', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        null,
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STALE);
    });

    it('T-33 malformed token → 400 "Invalid expectedUpdatedAt"', async () => {
      const s = await submittedWithTrays(ctx);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(s.clients[0].id, tt(ctx), 1)],
        'abc',
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'Invalid expectedUpdatedAt',
      );
    });

    it('T-34 parseable but different token (date-only) → 409; unparseable → 400', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null);
      expect(
        (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], '2020-01-01'))
          .status,
      ).toBe(409);
      expect(
        (await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], 'not-a-date'))
          .status,
      ).toBe(400);
    });

    it('T-35 entries [] or 5001 items → 400', async () => {
      const s = await submittedWithTrays(ctx);
      expect((await api.save(s.sheet.sheetId, [], null)).status).toBe(400);
      const many = Array.from({ length: 5001 }, (_, i) =>
        ret(i + 1, tt(ctx), 0),
      );
      expect((await api.save(s.sheet.sheetId, many, null)).status).toBe(400);
    });

    it('T-36 returned 2000 (with enough balance) and 0 are accepted and stored', async () => {
      const s = await submittedWithTrays(ctx, { qty: 2000 });
      const [c] = s.clients;
      const hi = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2000)],
        null,
      );
      expect(hi.status, body(hi)).toBe(200);
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        trays_returned: 2000,
        closing_balance: 0,
      });
      const lo = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 0)],
        hi.body.clientTraysUpdatedAt,
      );
      expect(lo.status, body(lo)).toBe(200);
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        trays_returned: 0,
        closing_balance: 2000,
      });
    });

    it('T-37 returned 2001, -1, 7.5, "5", null, omitted → 400, nothing saved', async () => {
      const s = await submittedWithTrays(ctx, { qty: 5 });
      const [c] = s.clients;
      const bad: Record<string, unknown> = {
        '2001': ret(c.id, tt(ctx), 2001),
        '-1': ret(c.id, tt(ctx), -1),
        '7.5': ret(c.id, tt(ctx), 7.5),
        '"5"': ret(c.id, tt(ctx), '5'),
        null: ret(c.id, tt(ctx), null),
        omitted: { clientId: c.id, trayTypeId: tt(ctx), category: 'MILK' },
      };
      for (const [label, entry] of Object.entries(bad)) {
        expect(
          (await api.save(s.sheet.sheetId, [entry], null)).status,
          label,
        ).toBe(400);
      }
      expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
      expect((await stored(s.sheet.sheetId))[0].trays_returned).toBe(0);
    });

    it('T-38 clientId / trayTypeId 0 or 1.5, category missing or FOO → 400', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      const good = ret(c.id, tt(ctx), 0);
      const variants = [
        { ...good, clientId: 0 },
        { ...good, clientId: 1.5 },
        { ...good, trayTypeId: 0 },
        { ...good, trayTypeId: 1.5 },
        { clientId: c.id, trayTypeId: tt(ctx), returned: 0 },
        { ...good, category: 'FOO' },
      ];
      for (const [i, entry] of variants.entries()) {
        expect(
          (await api.save(s.sheet.sheetId, [entry], null)).status,
          `variant ${i}`,
        ).toBe(400);
      }
    });

    it('T-39 same (client, tray type, category) twice → 400 duplicate; different categories are not a duplicate', async () => {
      const s = await submittedWithTrays(ctx, {
        products: [
          { tray: true },
          { tray: true, category: 'NON_MILK' as never },
        ],
      });
      const [c] = s.clients;
      const dup = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 1), ret(c.id, tt(ctx), 2)],
        null,
      );
      expect(dup.status).toBe(400);
      expect(JSON.stringify(dup.body.message)).toContain(
        'Duplicate entry for client',
      );
      const ok = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 1, 'MILK'), ret(c.id, tt(ctx), 1, 'NON_MILK')],
        null,
      );
      expect(ok.status, body(ok)).toBe(200);
    });

    it('T-40 unknown fields (top level and per entry) are stripped, not rejected', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      const res = await ctx.call(
        'post',
        `/client-trays/sheet/${s.sheet.sheetId}/save`,
        ctx.tokens.emp,
        {
          entries: [
            { ...ret(c.id, tt(ctx), 1), opening: 99, taken: 99, junk: true },
          ],
          expectedUpdatedAt: null,
          extra: 'x',
        },
      );
      expect(res.status, body(res)).toBe(200);
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        opening_balance: 0,
        trays_taken: 5,
        trays_returned: 1,
      });
    });

    it('T-41 duplicate entry together with a stale token → 400 (duplicate) first', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 1), ret(c.id, tt(ctx), 2)],
        null,
      );
      expect(res.status).toBe(400);
    });

    it('T-42 paper DRAFT / MORNING_SUBMITTED / FINALIZED → 400, even with a stale token (status before token)', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      for (const status of [
        'DRAFT',
        'MORNING_SUBMITTED',
        'FINALIZED',
      ] as const) {
        await ctx.setStatus(s.sheet, status);
        const res = await api.save(
          s.sheet.sheetId,
          [ret(c.id, tt(ctx), 1)],
          '2020-01-01T00:00:00.000Z',
        );
        expect(res.status, status).toBe(400);
        expect(res.body.message, status).toBe(
          'Tray cannot be edited in the current workflow state',
        );
      }
    });

    it('T-43 stale token with an otherwise valid payload → 409', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      const a = await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null);
      await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        a.body.clientTraysUpdatedAt,
      );
      const stale = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 3)],
        a.body.clientTraysUpdatedAt,
      );
      expect(stale.status).toBe(409);
      expect(stale.body.message).toBe(STALE);
    });
  });

  // ------------------------------------------------------------------ C4
  describe('balance and ledger rules', () => {
    it('T-50 return ≤ opening + taken: accepted; closing = opening + taken − returned', async () => {
      const s = await sheetWithOpening(ctx, D, 3, 5);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(s.c.id, tt(ctx), 8)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        opening_balance: 3,
        trays_taken: 5,
        trays_returned: 8,
        closing_balance: 0,
      });
    });

    it("T-51 return larger than today's taken but within opening + taken → accepted", async () => {
      const s = await sheetWithOpening(ctx, D, 3, 2);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(s.c.id, tt(ctx), 4)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        trays_returned: 4,
        closing_balance: 1,
      });
    });

    it('T-52 several returns above their balance → one 400 with details for every client; nothing saved', async () => {
      const s = await submittedWithTrays(ctx, { qty: 5, clients: 2 });
      const [c1, c2] = s.clients;
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c1.id, tt(ctx), 6), ret(c2.id, tt(ctx), 9)],
        null,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('One or more returns were rejected');
      expect(res.body.details).toHaveLength(2);
      expect(res.body.details[0]).toContain(`Client "${c1.name}"`);
      expect(res.body.details[1]).toContain(`Client "${c2.name}"`);
      for (const d of res.body.details)
        expect(d).toContain('exceeds the outstanding balance of 5');
      expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
      expect(
        (await stored(s.sheet.sheetId)).every((r) => r.trays_returned === 0),
      ).toBe(true);
    });

    it('T-53 entry for a client / tray type with no ledger line in that grid → 400 (wording not binding, CT-5.12)', async () => {
      const s = await ctx.world.scene({
        products: [{ tray: true }],
        clients: 2,
      });
      const [c1, c2] = s.clients;
      await ctx.seedNight(s.sheet, [n(c1, s.products[0], 5)]); // only c1 gets a ledger line
      await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
      expect(
        (await api.save(s.sheet.sheetId, [ret(c2.id, tt(ctx), 0)], null))
          .status,
      ).toBe(400); // client without a line
      expect(
        (await api.save(s.sheet.sheetId, [ret(c1.id, 2000000000, 0)], null))
          .status,
      ).toBe(400); // unknown tray type
      expect(
        (await api.save(s.sheet.sheetId, [ret(2000000000, tt(ctx), 0)], null))
          .status,
      ).toBe(400); // unknown client
      expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
    });

    it('T-54 client in the grid, tray column exists, client has no line for it: 0 accepted, 1 rejected', async () => {
      const s = await ctx.world.scene({
        products: [{ tray: true }],
        clients: 2,
        saleDate: D,
      });
      const [a, b] = s.clients;
      const X = tt(ctx);
      const Y = (await extraTrayType(ctx)).id;
      const prev = await ctx.world.newSheet({
        group: s.group,
        saleDate: addDays(D, -1),
      });
      await seedLedger(ctx, prev.sheetId, a.id, X, { taken: 3, closing: 3 });
      await seedLedger(ctx, prev.sheetId, b.id, Y, { taken: 4, closing: 4 });
      await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
      const bad = await api.save(s.sheet.sheetId, [ret(a.id, Y, 1)], null);
      expect(bad.status).toBe(400);
      const ok = await api.save(s.sheet.sheetId, [ret(a.id, Y, 0)], null);
      expect(ok.status, body(ok)).toBe(200);
    });

    it('T-55 inactive tray type, normal save: echoing the stored value accepted, any other value 400', async () => {
      const s = await twoTraySheet(ctx, D);
      await setTrayActive(ctx, s.X, false);
      const echo = await api.save(s.sheet.sheetId, [ret(s.c.id, s.X, 0)], null);
      expect(echo.status, body(echo)).toBe(200);
      const change = await api.save(
        s.sheet.sheetId,
        [ret(s.c.id, s.X, 1)],
        echo.body.clientTraysUpdatedAt,
      );
      expect(change.status).toBe(400);
      expect(body(change)).toContain('is inactive and read-only');
    });

    it('T-56 reconcile route: active type 400, inactive type change accepted, non-admin 403', async () => {
      const s = await twoTraySheet(ctx, D);
      await setTrayActive(ctx, s.X, false);
      const active = await api.reconcile(
        s.sheet.sheetId,
        [ret(s.c.id, s.Y, 0)],
        null,
      );
      expect(active.status).toBe(400);
      expect(body(active)).toContain(
        'Use the normal save instead of reconciliation',
      );
      expect(
        (
          await api.reconcile(
            s.sheet.sheetId,
            [ret(s.c.id, s.X, 2)],
            null,
            ctx.tokens.emp,
          )
        ).status,
      ).toBe(403);
      const ok = await api.reconcile(
        s.sheet.sheetId,
        [ret(s.c.id, s.X, 2)],
        null,
      );
      expect(ok.status, body(ok)).toBe(200);
      const row = (await stored(s.sheet.sheetId)).find(
        (r) => r.tray_type_id === s.X,
      )!;
      expect(row).toMatchObject({
        opening_balance: 3,
        trays_returned: 2,
        closing_balance: 1,
      });
    });

    it('T-57 reconcile on REOPENED: same rules plus conflict dry run and a queued cascade', async () => {
      const s = await twoTraySheet(ctx, D, 'REOPENED');
      await setTrayActive(ctx, s.X, false);
      const res = await api.reconcile(
        s.sheet.sheetId,
        [ret(s.c.id, s.X, 2)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      const outbox = await outboxOf(ctx, s.sheet.paperId);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({
        type: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
        resume_from_id: s.sheet.sheetId,
        status: 'PENDING',
      });
    });

    it('T-58 ledger lines not in the request keep their stored return', async () => {
      const s = await submittedWithTrays(ctx, { qty: 5, clients: 2 });
      const [c1, c2] = s.clients;
      const a = await api.save(
        s.sheet.sheetId,
        [ret(c1.id, tt(ctx), 2), ret(c2.id, tt(ctx), 3)],
        null,
      );
      expect(a.status, body(a)).toBe(200);
      const b = await api.save(
        s.sheet.sheetId,
        [ret(c1.id, tt(ctx), 4)],
        a.body.clientTraysUpdatedAt,
      );
      expect(b.status, body(b)).toBe(200);
      const rows = await stored(s.sheet.sheetId);
      expect(rows.find((r) => r.client_id === c1.id)!.trays_returned).toBe(4);
      expect(rows.find((r) => r.client_id === c2.id)!.trays_returned).toBe(3);
    });

    it('T-59 a save deletes obsolete stored rows of this sheet and touches no other sheet', async () => {
      const s = await ctx.world.scene({
        products: [{ tray: true }],
        clients: 2,
        saleDate: D,
      });
      const [c1, c2] = s.clients;
      await ctx.seedNight(s.sheet, [n(c1, s.products[0], 5)]);
      await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
      await seedLedger(ctx, s.sheet.sheetId, c2.id, tt(ctx), { closing: 0 }); // obsolete: no activity
      const later = await ctx.world.newSheet({
        group: s.group,
        saleDate: addDays(D, 1),
      });
      await seedLedger(ctx, later.sheetId, c1.id, tt(ctx), {
        opening: 77,
        taken: 2,
        returned: 1,
        closing: 78,
      });
      const before = await ctx.db.client_tray_transaction.findMany({
        where: { order_sheet_id: later.sheetId },
      });

      const res = await api.save(
        s.sheet.sheetId,
        [ret(c1.id, tt(ctx), 1)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      const rows = await stored(s.sheet.sheetId);
      expect(rows).toHaveLength(1);
      expect(rows[0].client_id).toBe(c1.id);
      expect(
        await ctx.db.client_tray_transaction.findMany({
          where: { order_sheet_id: later.sheetId },
        }),
      ).toEqual(before);
    });

    describe('T-60 a stranded legacy return blocks every save with 409 until repaired', () => {
      it('T-60a stranded return on a row that still has activity', async () => {
        const s = await submittedWithTrays(ctx, { qty: 5, clients: 2 });
        const [c1, c2] = s.clients;
        await ctx.db.client_tray_transaction.updateMany({
          where: { order_sheet_id: s.sheet.sheetId, client_id: c2.id },
          data: { trays_returned: 9, closing_balance: -4 },
        });
        const res = await api.save(
          s.sheet.sheetId,
          [ret(c1.id, tt(ctx), 1)],
          null,
        );
        expect(res.status, body(res)).toBe(409);
        expect(res.body.message).toBe(DISCREPANCY);
        expect(res.body.details[0]).toContain(iso(s.sheet.saleDate));
        expect(res.body.details[0]).toContain(`client "${c2.name}"`);
        expect(res.body.details[0]).toContain('9');
        expect(res.body.details[0]).toContain(
          'returned but only 5 outstanding',
        );
        expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
        expect(
          (await stored(s.sheet.sheetId)).find((r) => r.client_id === c2.id)!
            .trays_returned,
        ).toBe(9); // never capped

        const repair = await api.save(
          s.sheet.sheetId,
          [ret(c1.id, tt(ctx), 1), ret(c2.id, tt(ctx), 5)],
          null,
        );
        expect(repair.status, body(repair)).toBe(200);
      });

      it('T-60b stranded return on a row with no balance at all (repaired with 0)', async () => {
        const s = await ctx.world.scene({
          products: [{ tray: true }],
          clients: 2,
        });
        const [c1, c2] = s.clients;
        await ctx.seedNight(s.sheet, [n(c1, s.products[0], 5)]);
        await ctx.setStatus(s.sheet, 'NIGHT_SUBMITTED');
        await seedLedger(ctx, s.sheet.sheetId, c2.id, tt(ctx), {
          returned: 3,
          closing: -3,
        });
        const res = await api.save(
          s.sheet.sheetId,
          [ret(c1.id, tt(ctx), 1)],
          null,
        );
        expect(res.status, body(res)).toBe(409);
        expect(res.body.message).toBe(DISCREPANCY);
        const repair = await api.save(
          s.sheet.sheetId,
          [ret(c1.id, tt(ctx), 1), ret(c2.id, tt(ctx), 0)],
          null,
        );
        expect(repair.status, body(repair)).toBe(200);
        expect(
          (await stored(s.sheet.sheetId)).some((r) => r.client_id === c2.id),
        ).toBe(false);
      });
    });

    it('T-61 the response token replaces the local one: a second save works without reload; the old token 409s', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      const first = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 1)],
        null,
      );
      const second = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        first.body.clientTraysUpdatedAt,
      );
      expect(second.status, body(second)).toBe(200);
      expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
        second.body.clientTraysUpdatedAt,
      );
      expect(
        (
          await api.save(
            s.sheet.sheetId,
            [ret(c.id, tt(ctx), 3)],
            first.body.clientTraysUpdatedAt,
          )
        ).status,
      ).toBe(409);
    });

    it('T-62 one bad entry among 50 fails the whole request; token and returns unchanged', async () => {
      const s = await submittedWithTrays(ctx, { qty: 1, clients: 50 });
      const entries = s.clients.map((c, i) =>
        ret(c.id, tt(ctx), i === 49 ? 2 : 1),
      );
      const res = await api.save(s.sheet.sheetId, entries, null);
      expect(res.status).toBe(400);
      expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
      const rows = await stored(s.sheet.sheetId);
      expect(rows).toHaveLength(50);
      expect(rows.every((r) => r.trays_returned === 0)).toBe(true);
    }, 60000);

    it('T-63 [service seam] a return above 2000 is rejected with 400 (the DTO fires first through the API)', () => {
      // Not reachable through the API (CT-5.12 / D-6): the service check is exercised directly.
      // The balance is 5000 so the 2000-per-row limit is the only possible reason for the rejection.
      const svc = ctx.app.get(ClientTraysValidationService, { strict: false });
      const lines = [
        {
          clientId: 1,
          trayTypeId: 1,
          category: 'MILK',
          opening: 0,
          taken: 5000,
          returned: 0,
          closing: 5000,
        },
      ];
      const trayTypes = [
        { id: 1, is_active: true, color: 'x', master_brand: { name: 'b' } },
      ];
      const clients = [{ id: 1, name: 'c' }];
      let err: any;
      try {
        svc.validateReturnEntries(
          [ret(1, 1, 2001)] as never,
          lines as never,
          trayTypes as never,
          clients as never,
          false,
        );
      } catch (e) {
        err = e;
      }
      expect(err?.getStatus?.()).toBe(400);
    });
  });

  // ------------------------------------------------------------------ F3: CT-5.14, CT-13
  describe('a save that changes nothing is a no-op (CT-5.14)', () => {
    it('T-140 same ledger, matching token → 200 with the current token; no write, token and updated_at unchanged', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      const first = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        null,
      );
      const before = (await stored(s.sheet.sheetId))[0];
      await sleep(25);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        first.body.clientTraysUpdatedAt,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body.clientTraysUpdatedAt).toBe(
        first.body.clientTraysUpdatedAt,
      );
      expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
        first.body.clientTraysUpdatedAt,
      );
      expect((await stored(s.sheet.sheetId))[0].updated_at.getTime()).toBe(
        before.updated_at.getTime(),
      );
    });

    it('T-141 same, on a never-saved sheet → 200 with clientTraysUpdatedAt null; token stays null', async () => {
      const s = await submittedWithTrays(ctx);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(s.clients[0].id, tt(ctx), 0)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body.clientTraysUpdatedAt).toBeNull();
      expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();
    });

    it('T-142 same payload with a stale token → 409 (token compared first)', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 2)], null);
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        '2020-01-01T00:00:00.000Z',
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(STALE);
    });

    it('T-143 one return changed → the token advances once and the ledger is written', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      const a = await api.save(s.sheet.sheetId, [ret(c.id, tt(ctx), 1)], null);
      const b = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 2)],
        a.body.clientTraysUpdatedAt,
      );
      expect(new Date(b.body.clientTraysUpdatedAt).getTime()).toBeGreaterThan(
        new Date(a.body.clientTraysUpdatedAt).getTime(),
      );
      expect(await trayToken(ctx, s.sheet.sheetId)).toBe(
        b.body.clientTraysUpdatedAt,
      );
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        trays_returned: 2,
        closing_balance: 3,
      });
    });

    it('T-144 stored return null (legacy), save sends 0 → counts as a change: becomes 0, token advances', async () => {
      const s = await submittedWithTrays(ctx);
      await ctx.db.client_tray_transaction.updateMany({
        where: { order_sheet_id: s.sheet.sheetId },
        data: { trays_returned: null },
      });
      const res = await api.save(
        s.sheet.sheetId,
        [ret(s.clients[0].id, tt(ctx), 0)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body.clientTraysUpdatedAt).not.toBeNull();
      expect((await stored(s.sheet.sheetId))[0].trays_returned).toBe(0);
    });

    it('T-145 stored opening / closing differ from the live values, save echoes the returns → change: derived values refreshed', async () => {
      const s = await submittedWithTrays(ctx);
      await ctx.db.client_tray_transaction.updateMany({
        where: { order_sheet_id: s.sheet.sheetId },
        data: { opening_balance: 77, closing_balance: 82 },
      });
      const res = await api.save(
        s.sheet.sheetId,
        [ret(s.clients[0].id, tt(ctx), 0)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body.clientTraysUpdatedAt).not.toBeNull();
      expect((await stored(s.sheet.sheetId))[0]).toMatchObject({
        opening_balance: 0,
        closing_balance: 5,
      });
    });

    it('T-146 REOPENED, no-op save → 200, no outbox row', async () => {
      const s = await submittedWithTrays(ctx);
      const [c] = s.clients;
      await ctx.seedMorning(s.sheet, [
        {
          clientId: c.id,
          productId: s.products[0].id,
          deliveredQty: 5,
        } as never,
      ]);
      await ctx.setStatus(s.sheet, 'REOPENED');
      const res = await api.save(
        s.sheet.sheetId,
        [ret(c.id, tt(ctx), 0)],
        null,
      );
      expect(res.status, body(res)).toBe(200);
      expect(res.body.clientTraysUpdatedAt).toBeNull();
      expect(await outboxOf(ctx, s.sheet.paperId)).toHaveLength(0);
    });
  });

  it('T-147 changing save and changing reconcile answer 200 (not 201)', async () => {
    const s = await twoTraySheet(ctx, D);
    await setTrayActive(ctx, s.X, false);
    const save = await api.save(s.sheet.sheetId, [ret(s.c.id, s.Y, 1)], null);
    expect(save.status, body(save)).toBe(200);
    expect(save.body.clientTraysUpdatedAt).not.toBeNull();
    const rec = await api.reconcile(
      s.sheet.sheetId,
      [ret(s.c.id, s.X, 2)],
      save.body.clientTraysUpdatedAt,
    );
    expect(rec.status, body(rec)).toBe(200);
  });

  it('T-153 stranded return on an inactive tray type: normal save 409 with details; admin reconcile within the balance repairs it', async () => {
    const s = await twoTraySheet(ctx, D);
    await seedLedger(ctx, s.sheet.sheetId, s.c.id, s.X, {
      opening: 3,
      returned: 9,
      closing: -6,
    });
    await setTrayActive(ctx, s.X, false);
    // the UI sends active tray types only in normal mode
    const blocked = await api.save(
      s.sheet.sheetId,
      [ret(s.c.id, s.Y, 1)],
      null,
    );
    expect(blocked.status, body(blocked)).toBe(409);
    expect(blocked.body.message).toBe(DISCREPANCY);
    expect(blocked.body.details[0]).toContain(
      'returned but only 3 outstanding',
    );
    expect(await trayToken(ctx, s.sheet.sheetId)).toBeNull();

    const fix = await api.reconcile(
      s.sheet.sheetId,
      [ret(s.c.id, s.X, 3)],
      null,
    );
    expect(fix.status, body(fix)).toBe(200);
    const again = await api.save(
      s.sheet.sheetId,
      [ret(s.c.id, s.Y, 1)],
      fix.body.clientTraysUpdatedAt,
    );
    expect(again.status, body(again)).toBe(200);
  });

  // T-157 (client moved group takes its balance along) is decided but not implemented: see coverage map.
  it.todo(
    'T-157 client moved to another group with an open balance: balance moves with the client (CT-6.7, blocked: needs CT-15.8 design and the client-update hook)',
  );
});
