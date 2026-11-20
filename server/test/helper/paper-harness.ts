/**
 * Paper test harness. Thin layer over orders-harness (same pattern as collections-harness and
 * cash-settlement-harness). It reuses the app bootstrap, the world builder, the Vehicle Allocation helpers and the
 * Purchase helpers, and adds Paper helpers under `ctx.pp`. Nothing here is production code and nothing in the other
 * harnesses is changed.
 *
 * Dates: every paper made here has a sale date from 2097-01-01 on (`saleDateOf(k)`), inside the range the harness
 * purges (>= 2090). Tests that depend on "now" (generate, /papers/current) freeze ONLY `Date` (`pp.freeze`) at an
 * instant in 2097 and receive fresh JWTs signed under that clock (`pp.tk`).
 *
 * Seams (each is flagged in PAPER_TEST_COVERAGE.md): DB writes for legacy / negative data, `vi.spyOn` of a collaborator
 * to raise a driver error (P2028 timeout, P2034 serialization, unexpected Error), and the stubbed relay / processor.
 */
import { vi } from 'vitest';
import {
  createOrdersTestContext,
  DAY,
  m,
  n,
  type OrdersCtx,
  type TClient,
  type TDist,
  type TGroup,
  type TProduct,
  type TSheet,
} from './orders-harness.js';
import { PaperModule } from '../../src/modules/transactions/paper/paper.module.js';
import { addVehicle, al, vaApi, type Veh } from './vehicle-allocation-helpers.js';
import {
  cleanupPuTests,
  ensureDairyHeader,
  pe,
  puApi,
  puToken,
} from './purchase-helpers.js';

export { m, n };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const BASE = Date.UTC(2097, 0, 1);
export const saleDateOf = (k: number) => new Date(BASE + k * DAY);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const shift = (day: string, days: number) =>
  ymd(new Date(Date.parse(day) + days * DAY));

export const STATUSES = [
  'DRAFT',
  'NIGHT_SUBMITTED',
  'MORNING_SUBMITTED',
  'FINALIZED',
  'REOPENED',
] as const;

/** PA-13.1, written out as the approved table (not derived from the implementation). */
export const flags = (status: string) => {
  const t: Record<string, [string | null, boolean, boolean, boolean, boolean, boolean, boolean]> = {
    DRAFT: ['NIGHT', true, false, false, false, false, true],
    NIGHT_SUBMITTED: ['MORNING', false, true, false, false, false, false],
    MORNING_SUBMITTED: [null, false, false, true, false, true, false],
    FINALIZED: [null, false, false, false, true, false, false],
    REOPENED: [null, false, false, true, false, false, false],
  };
  const [s, a, b, c, d, e, f] = t[status];
  return {
    status,
    activeExecutionSession: s,
    canSubmitNight: a,
    canSubmitMorning: b,
    canFinalize: c,
    canReopen: d,
    canRevertMorning: e,
    canMarkNoOperation: f,
  };
};

/** Messages copied from PAPER_BUSINESS_DECISION.md (PA-2 to PA-19) and the sibling decision files. */
export const MSG = {
  PAPER_NOT_FOUND: 'Order paper not found',
  NIGHT_NOT_READY: 'Night submission is not ready',
  MORNING_NOT_READY: 'Morning submission is not ready',
  FINALIZE_NOT_READY: 'Finalization is not ready',
  NIGHT_DONE: (s: string) => `Night entries were already submitted (paper is ${s})`,
  MORNING_DONE: (s: string) => `Morning entries were already submitted (paper is ${s})`,
  ALREADY_FINALIZED: 'Paper is already FINALIZED',
  ALREADY_REOPENED: 'Paper is already REOPENED',
  TRANSITION: (a: string, b: string) => `Cannot transition from ${a} to ${b}`,
  REVERT_ONLY: (s: string) =>
    `Only a MORNING_SUBMITTED paper can be reverted to NIGHT_SUBMITTED (paper is ${s})`,
  NOOP_DRAFT_ONLY: (s: string) =>
    `Routes can only be marked or unmarked as no-operation while the paper is DRAFT (paper is ${s})`,
  SHEETS_NOT_IN_PAPER: (ids: number[], paperId: number) =>
    `Sheet(s) ${ids.join(', ')} do not belong to paper ${paperId}`,
  NO_ACTIVE_GROUPS: 'No active groups found to generate sheets',
  INVALID_DATE: 'Invalid date format',
  FUTURE: (d: string) =>
    `Papers cannot be generated for a future date. The latest date that can be generated is ${d}`,
  BACKFILL_ADMIN_ONLY: 'Only an administrator can generate a paper for a past date',
  BACKFILL_REASON: 'A reason is required to generate a paper for a past date',
  BACKFILL_TOO_OLD: 'A paper can only be generated up to 31 days back',
  PREV_NOT_FINALIZED: (d: string, s: string) =>
    `Cannot finalize: the previous paper (${d}) is ${s}. Finalize it first.`,
  PREV_PROP_FAILED: (d: string) =>
    `Cannot finalize: background tray propagation for the previous paper (${d}) has failed. An administrator must retry it (or dismiss it with a reason) first.`,
  TIMEOUT: 'The request took too long and nothing was saved. Please retry.',
  RETRY:
    'Your request conflicted with another update and could not be completed. Please retry.',
  ZERO_ALLOC_DRAFT:
    'Purchase: no vehicle allocation exists yet. If none is saved, a zero-allocation sign-off is required after night submit and before morning submit',
  SIGN_OFF_DETAIL: 'Zero allocation: a sign-off is required before submitting',
  transferRule: (supplier: string, owner: string) =>
    `Transfer rule not found for supplier ${supplier} and owner ${owner}`,
};

/** A driver error as the code under test sees it (P2028 timeout, P2034 serialization, P2003 FK, P2025 not found). */
export const dbError = (code: string) =>
  Object.assign(new Error(`db error ${code}`), { code });

export const details = (res: { body: any }): string[] => res.body.details ?? [];

export type Scene = {
  k: number;
  paperId: number;
  sheetId: number;
  sheet: TSheet;
  group: TGroup;
  c: TClient;
  p: TProduct;
  v: Veh;
  supplier: TDist;
  qty: number;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
function buildPp(ctx: OrdersCtx) {
  const db = ctx.db;
  const w = ctx.world;
  const ruleIds: number[] = [];
  const bankIds: number[] = [];
  let groupsOff: number[] = [];

  /** Tokens used by `api` defaults. `freeze` replaces them with tokens signed under the frozen clock. */
  const tk = { emp: ctx.tokens.emp, admin: ctx.tokens.admin };

  const api = {
    generate: (body?: unknown, token: string | null = tk.emp) =>
      ctx.call('post', '/papers', token, body),
    current: (token: string | null = tk.emp) => ctx.call('get', '/papers/current', token),
    list: (qs = '', token: string | null = tk.emp) => ctx.call('get', `/papers${qs}`, token),
    get: (id: number | string, token: string | null = tk.emp) =>
      ctx.call('get', `/papers/${id}`, token),
    propagation: (id: number | string, token: string | null = tk.emp) =>
      ctx.call('get', `/papers/${id}/propagation`, token),
    readiness: (id: number | string, token: string | null = tk.emp) =>
      ctx.call('get', `/papers/${id}/readiness`, token),
    noOp: (id: number | string, body: unknown, token: string | null = tk.emp) =>
      ctx.call('post', `/papers/${id}/sheets/no-operation`, token, body),
    submitNight: (id: number | string, token: string | null = tk.emp) =>
      ctx.call('post', `/papers/${id}/submit-night`, token),
    submitMorning: (id: number | string, token: string | null = tk.emp) =>
      ctx.call('post', `/papers/${id}/submit-morning`, token),
    finalize: (id: number | string, token: string | null = tk.admin) =>
      ctx.call('post', `/papers/${id}/finalize`, token),
    reopen: (id: number | string, body: unknown, token: string | null = tk.admin) =>
      ctx.call('post', `/papers/${id}/reopen`, token, body),
    revert: (id: number | string, body: unknown, token: string | null = tk.admin) =>
      ctx.call('post', `/papers/${id}/revert-morning`, token, body),
    retry: (id: number | string, token: string | null = tk.admin) =>
      ctx.call('post', `/papers/${id}/propagation/retry`, token),
    dismiss: (id: number | string, body: unknown, token: string | null = tk.admin) =>
      ctx.call('post', `/papers/${id}/propagation/dismiss`, token, body),
    problems: (token: string | null = tk.admin) =>
      ctx.call('get', '/papers/propagation/problems', token),
    audit: (id: number | string, token: string | null = tk.admin) =>
      ctx.call('get', `/papers/${id}/audit`, token),
  };

  // --- DB reads -------------------------------------------------------------
  const paper = (id: number) => db.order_paper.findUniqueOrThrow({ where: { id } });
  const audits = (id: number, action?: string) =>
    db.paper_audit_log.findMany({
      where: { order_paper_id: id, ...(action ? { action: action as never } : {}) },
      orderBy: { id: 'asc' },
    });
  const outbox = (id: number) =>
    db.propagation_outbox.findMany({ where: { paper_id: id }, orderBy: { id: 'asc' } });
  const setStatus = (id: number, status: string) =>
    db.order_paper.update({ where: { id }, data: { status: status as never } });
  const activeGroups = () => db.master_group.findMany({ where: { is_active: true } });

  // --- seams ------------------------------------------------------------------
  /** Deactivates every active group (restored by cleanup). Needs tests of this file to run one at a time. */
  const deactivateAllGroups = async () => {
    const ids = (await activeGroups()).map((g) => g.id);
    groupsOff.push(...ids);
    await db.master_group.updateMany({ where: { id: { in: ids } }, data: { is_active: false } });
  };

  /** Freezes ONLY Date and signs fresh tokens under that clock. */
  const freeze = (instant: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instant));
    tk.emp = ctx.tokenFor(ctx.users.emp);
    tk.admin = ctx.tokenFor(ctx.users.admin);
    return tk;
  };

  const addRule = async (supplier: TDist, owner: TDist) => {
    const r = await db.distributor_transfer_rule.create({
      data: { supplier_distributor_id: supplier.id, owner_distributor_id: owner.id },
    });
    ruleIds.push(r.id);
    return r;
  };

  const addBank = async () => {
    const b = await db.master_bank.create({ data: { name: `T-bank-${w.sfx}-${bankIds.length}-${Date.now()}` } });
    bankIds.push(b.id);
    return b;
  };

  const seedOutbox = (
    paperId: number,
    status: string,
    o: { type?: string; resume?: number | null; error?: string | null; attempts?: number } = {},
  ) =>
    db.propagation_outbox.create({
      data: {
        type: o.type ?? 'CLIENT_TRAYS_FORWARD',
        paper_id: paperId,
        resume_from_id: o.resume ?? null,
        status,
        attempts: o.attempts ?? 0,
        last_error: o.error ?? null,
      },
    });

  /** Makes an outbox row look untouched for `minutes` minutes. */
  const age = (id: number, minutes: number) =>
    db.$executeRaw`UPDATE propagation_outbox SET updated_at = (now() AT TIME ZONE 'UTC') - make_interval(mins => ${minutes}::int) WHERE id = ${id}`;

  /** A second sheet on the paper (own group, own client). */
  const addEmptySheet = async (
    paperId: number,
    o: { noOp?: boolean; session?: 'NIGHT' | 'MORNING' } = {},
  ) => {
    const group = await w.addGroup();
    const sheet = await db.order_sheet.create({
      data: {
        order_paper_id: paperId,
        group_id: group.id,
        delivery_session: o.session ?? 'NIGHT',
        no_operation: o.noOp ?? false,
      },
    });
    const client = await w.addClient({ group });
    return { group, sheetId: sheet.id, client };
  };

  /** DB seam: a stored client_collection row (negative values cannot be written through the API). */
  const seedCollection = (
    sheetId: number,
    clientId: number,
    cols: Partial<Record<
      'cash_collection' | 'office_cash_collection' | 'cheque_collection' | 'online_collection' | 'bank_deposit',
      number
    >>,
  ) =>
    db.client_collection.create({
      data: { order_sheet_id: sheetId, client_id: clientId, category: 'MILK' as never, ...cols },
    });

  /** Everything the Paper readiness collectors read, serialised, to prove a read changed nothing (PA-19.1). */
  const snapshot = async (paperId: number) => {
    const byPaper = { order_paper_id: paperId };
    const bySheet = { order_sheet: { order_paper_id: paperId } };
    const asc = { id: 'asc' as const };
    return JSON.stringify(
      await Promise.all([
        db.order_paper.findUnique({ where: { id: paperId } }),
        db.order_sheet.findMany({ where: byPaper, orderBy: asc }),
        db.order_sheet_items.findMany({ where: bySheet, orderBy: asc }),
        db.client_tray_transaction.findMany({ where: bySheet, orderBy: asc }),
        db.client_collection.findMany({ where: bySheet, orderBy: asc }),
        db.cash_route_settlement.findMany({ where: bySheet, orderBy: asc }),
        db.cash_direct_collection.findMany({ where: byPaper, orderBy: asc }),
        db.cash_bank_deposit.findMany({ where: byPaper, orderBy: asc }),
        db.vehicle_allocation_paper.findMany({ where: byPaper, orderBy: asc }),
        db.vehicle_allocation.findMany({ where: { vehicle_allocation_paper: byPaper }, orderBy: asc }),
        db.vehicle_allocation_anomaly.findMany({ where: { vehicle_allocation_paper: byPaper }, orderBy: asc }),
        db.purchase_paper.findMany({ where: byPaper, orderBy: asc }),
        db.purchase_entry.findMany({ where: { purchase_paper: byPaper }, orderBy: asc }),
        db.dairy_tray_paper.findMany({ where: byPaper, orderBy: asc }),
        db.dairy_tray_transaction.findMany({ where: { dairy_tray_paper: byPaper }, orderBy: asc }),
        db.distributor_transfer.findMany({ where: byPaper, orderBy: asc }),
        db.propagation_outbox.findMany({ where: { paper_id: paperId }, orderBy: asc }),
        db.paper_audit_log.findMany({ where: byPaper, orderBy: asc }),
      ]),
    );
  };

  // --- scenes ----------------------------------------------------------------
  /** Delivered quantities (Orders morning save) for the scene's line. NIGHT_SUBMITTED or REOPENED only. */
  const deliver = async (sc: Scene) => {
    await ctx.seedMorning(sc.sheet, [m(sc.c, sc.p, sc.qty)]);
  };

  /** One saved purchase against the scene's allocation (Purchase save). NIGHT_SUBMITTED or REOPENED only. */
  const buy = async (sc: Scene, qty = sc.qty) => {
    const entry = await pe(ctx, sc.paperId, sc.v, sc.supplier, sc.p, qty);
    const r = await puApi(ctx).save(sc.paperId, [entry], await puToken(ctx, sc.paperId));
    if (r.status !== 200) throw new Error(`buy failed: ${JSON.stringify(r.body)}`);
  };

  /** Moves a DRAFT scene to `to`, doing the data work each stage needs (DB status writes, API data writes). */
  const advance = async (sc: Scene, to: string): Promise<Scene> => {
    if (to === 'DRAFT') return sc;
    await setStatus(sc.paperId, 'NIGHT_SUBMITTED');
    if (to === 'NIGHT_SUBMITTED') return sc;
    await deliver(sc);
    await buy(sc);
    await setStatus(sc.paperId, to);
    return sc;
  };

  /**
   * One group, one client, `qty` ordered, allocated to one vehicle (unless alloc is false), dairy header present,
   * then advanced to `status`. In DRAFT it passes night submit; in NIGHT_SUBMITTED after deliver + buy it passes
   * morning submit; in MORNING_SUBMITTED it is ready to finalize (given a FINALIZED predecessor, `prev`).
   */
  const paperScene = async (
    o: { k?: number; qty?: number; status?: string; supplier?: 'A' | 'B'; tray?: boolean; alloc?: boolean } = {},
  ): Promise<Scene> => {
    const k = o.k ?? 0;
    const qty = o.qty ?? 10;
    const supplier = o.supplier === 'B' ? w.distB : w.distA;
    const s = await w.scene({
      products: [{ tray: o.tray, distributors: [{ dist: w.distA }, { dist: w.distB }] }],
      clients: 1,
      saleDate: saleDateOf(k),
    });
    const c = s.clients[0];
    const p = s.products[0];
    if (o.supplier === 'B') {
      await db.master_client_category.updateMany({
        where: { client_id: c.id },
        data: { supplier_distributor_id: w.distB.id },
      });
    }
    await ctx.seedNight(s.sheet, [n(c, p, qty)]);
    const v = await addVehicle(ctx);
    if (o.alloc !== false) {
      const r = await vaApi(ctx).save(s.sheet.paperId, [al(v, supplier, p, qty)], null);
      if (r.status !== 200) throw new Error(`paperScene: allocation failed ${JSON.stringify(r.body)}`);
    }
    await ensureDairyHeader(ctx, s.sheet.paperId);
    const sc: Scene = {
      k,
      paperId: s.sheet.paperId,
      sheetId: s.sheet.sheetId,
      sheet: s.sheet,
      group: s.group,
      c,
      p,
      v,
      supplier,
      qty,
    };
    return advance(sc, o.status ?? 'DRAFT');
  };

  /** An earlier paper (sale date k - gap) with the given status: the "previous paper" of PA-8.2. */
  const prev = (sc: { k: number }, status = 'FINALIZED', gap = 1) =>
    w.newSheet({ saleDate: saleDateOf(sc.k - gap), status: status as never });

  /**
   * Two clients on one sheet, two supplier/owner pairs that need a transfer rule:
   * c1 supplied by distB, owned by distA (pair B/A); c2 supplied by distA, owned by distB (pair A/B).
   * Stage NIGHT_SUBMITTED (delivered quantities saved) unless `status` says otherwise.
   */
  const pairScene = async (o: { k?: number; status?: string } = {}) => {
    const k = o.k ?? 0;
    const s = await w.scene({
      products: [{ distributors: [{ dist: w.distA }, { dist: w.distB }] }],
      clients: 2,
      saleDate: saleDateOf(k),
    });
    const [c1, c2] = s.clients;
    const p = s.products[0];
    await db.master_client_category.updateMany({
      where: { client_id: c1.id },
      data: { supplier_distributor_id: w.distB.id },
    });
    await db.master_client.update({ where: { id: c2.id }, data: { owner_distributor_id: w.distB.id } });
    await ctx.seedNight(s.sheet, [n(c1, p, 5), n(c2, p, 5)]);
    await setStatus(s.sheet.paperId, 'NIGHT_SUBMITTED');
    await ctx.seedMorning(s.sheet, [m(c1, p, 5), m(c2, p, 5)]);
    await ensureDairyHeader(ctx, s.sheet.paperId);
    await setStatus(s.sheet.paperId, o.status ?? 'NIGHT_SUBMITTED');
    return { k, group: s.group, c1, c2, p, paperId: s.sheet.paperId, sheetId: s.sheet.sheetId, sheet: s.sheet };
  };

  // --- cleanup -----------------------------------------------------------------
  /** Call from afterEach: restores mocks, the clock, deactivated groups; removes every paper >= 2090 and what hangs off it. */
  const cleanup = async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    tk.emp = ctx.tokens.emp;
    tk.admin = ctx.tokens.admin;
    if (groupsOff.length > 0) {
      await db.master_group.updateMany({ where: { id: { in: groupsOff } }, data: { is_active: true } });
      groupsOff = [];
    }
    const old = await db.order_paper.findMany({
      where: { sale_date: { gte: new Date('2090-01-01') } },
      select: { id: true },
    });
    const ids = old.map((x) => x.id);
    await db.propagation_outbox.deleteMany({ where: { paper_id: { in: ids } } });
    await db.order_paper.deleteMany({ where: { id: { in: ids } } });
    await db.distributor_transfer_rule.deleteMany({ where: { id: { in: ruleIds.splice(0) } } });
    await db.master_bank.deleteMany({ where: { id: { in: bankIds.splice(0) } } });
    await cleanupPuTests(ctx);
  };

  return {
    tk,
    api,
    paper,
    audits,
    outbox,
    setStatus,
    activeGroups,
    deactivateAllGroups,
    freeze,
    addRule,
    addBank,
    seedOutbox,
    age,
    addEmptySheet,
    seedCollection,
    snapshot,
    deliver,
    buy,
    advance,
    paperScene,
    prev,
    pairScene,
    cleanup,
  };
}

export type PaperCtx = OrdersCtx & { pp: ReturnType<typeof buildPp> };

export async function createPaperTestContext(
  opts: Parameters<typeof createOrdersTestContext>[0] = {},
): Promise<PaperCtx> {
  // orders-harness mounts Auth, Orders, VehicleAllocation, Purchase and Collections; Paper is added here.
  const ctx = await createOrdersTestContext({
    ...opts,
    modules: [PaperModule, ...((opts.modules ?? []) as never[])],
  });
  return Object.assign(ctx, { pp: buildPp(ctx) });
}
