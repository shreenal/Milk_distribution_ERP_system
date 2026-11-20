/**
 * Thin glue for the Dairy Trays specs. Built ONLY on the Orders harness, the Vehicle Allocation helpers and the
 * Purchase helpers. Nothing here is production code.
 *
 * Seams used (each is flagged in DAIRY_TRAYS_TEST_COVERAGE.md):
 *  - buyTrays: writes a purchase_entry row directly (taken quantity), instead of driving the Purchase API.
 *  - rebuildLedger: runs the real forward job body (DairyTraysPropagationService.propagateFromPaperChunk) inside a
 *    transaction, which is how a stored ledger is produced for a paper.
 */
import { vi } from 'vitest';
import {
  type OrdersCtx,
  type TDist,
  type TProduct,
  type TSheet,
} from './orders-harness.js';
import {
  addVehicle,
  type Session,
  type Veh,
} from './vehicle-allocation-helpers.js';
import {
  cleanupPuTests,
  dairyRows,
  ensureDairyHeader,
} from './purchase-helpers.js';
import { DairyTraysPropagationService } from '../../src/modules/transactions/dairy-trays/services/dairy-trays-propagation.service.js';
import { PROPAGATION_OUTBOX_TYPES } from '../../src/modules/transactions/propagation-queue/propagation-queue.constants.js';

export { addVehicle, setVehicleActive } from './vehicle-allocation-helpers.js';
export {
  addDays,
  dairyRows,
  ensureDairyHeader,
  vname,
} from './purchase-helpers.js';
export type { Session, Veh };

// ---------------------------------------------------------------------------
// Messages (dairy-trays.constants.ts, as approved in the DT decision file)
// ---------------------------------------------------------------------------
export const STALE_DT =
  'Dairy Trays data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';
export const DT_PAPER_NOT_FOUND = 'Order paper not found';
export const DT_NO_HEADER =
  'Dairy tray tracking has not been generated for this paper';
export const DT_EDIT_NOT_ALLOWED =
  'Dairy tray tracking cannot be edited in the current workflow state';
export const DT_RETURNS_REJECTED = 'One or more returns were rejected';
export const DT_DISCREPANCY =
  'This change would leave returned trays higher than the outstanding balance. Correct the returns first, then repeat the change';
export const DT_NOT_READY = 'Dairy trays are not ready for submission';
export const DT_SAVED = 'Dairy tray returns saved successfully';
export const DT_RETRY_MSG =
  'Your request conflicted with another update and could not be completed. Please retry.';
export const DT_TIMEOUT_MSG =
  'The request took too long and nothing was saved. Please retry.';

/** Base of the dates used by the Dairy Trays specs (the harness world uses 2091; cleanup removes >= 2090). */
const BASE = Date.UTC(2096, 0, 1);
export const saleDateOf = (k: number) => new Date(BASE + k * 86_400_000);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
type WriteOpts = { token?: string | null; extra?: Record<string, unknown> };

export type DtEntry = {
  vehicleId: unknown;
  trayTypeId: unknown;
  deliverySession: unknown;
  returned: unknown;
};

/** One return entry. */
export const re = (
  v: { id: number },
  trayTypeId: number,
  returned: unknown,
  session: Session | string = 'NIGHT',
): DtEntry => ({
  vehicleId: v.id,
  trayTypeId,
  deliverySession: session,
  returned,
});

export const dtApi = (ctx: OrdersCtx) => {
  const tok = (o: WriteOpts, dflt: string) =>
    o.token === undefined ? dflt : o.token;
  return {
    get: (id: number | string, token: string | null = ctx.tokens.emp) =>
      ctx.call('get', `/dairy-trays/${id}`, token),
    /** expected undefined = omit the field */
    save: (
      id: number | string,
      entries: unknown,
      expected: string | null | undefined,
      o: WriteOpts = {},
    ) =>
      ctx.call('post', `/dairy-trays/${id}/save`, tok(o, ctx.tokens.emp), {
        entries,
        expectedUpdatedAt: expected,
        ...(o.extra ?? {}),
      }),
    reconcile: (
      id: number | string,
      entries: unknown,
      expected: string | null | undefined,
      o: WriteOpts = {},
    ) =>
      ctx.call(
        'post',
        `/dairy-trays/${id}/reconcile-inactive`,
        tok(o, ctx.tokens.admin),
        { entries, expectedUpdatedAt: expected, ...(o.extra ?? {}) },
      ),
    recalc: (body: unknown, o: { token?: string | null } = {}) =>
      ctx.call(
        'post',
        '/dairy-trays/recalculate',
        o.token === undefined ? ctx.tokens.admin : o.token,
        body,
      ),
  };
};

// ---------------------------------------------------------------------------
// DB reads
// ---------------------------------------------------------------------------
export const dtHeader = (ctx: OrdersCtx, paperId: number) =>
  ctx.db.dairy_tray_paper.findUnique({ where: { order_paper_id: paperId } });

export async function dtToken(ctx: OrdersCtx, paperId: number) {
  return (await dtHeader(ctx, paperId))?.updated_at.toISOString() ?? null;
}

export async function dtRow(
  ctx: OrdersCtx,
  paperId: number,
  v: { id: number },
  trayTypeId: number,
  session: Session = 'NIGHT',
) {
  return (
    (await dairyRows(ctx, paperId)).find(
      (r) =>
        r.vehicle_id === v.id &&
        r.tray_type_id === trayTypeId &&
        r.delivery_session === session,
    ) ?? null
  );
}

export const forwardJobs = (ctx: OrdersCtx, paperId: number) =>
  ctx.db.propagation_outbox.findMany({
    where: {
      paper_id: paperId,
      type: PROPAGATION_OUTBOX_TYPES.DAIRY_TRAYS_FORWARD,
    },
    orderBy: { id: 'asc' },
  });

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
export const rowOf = (
  body: any,
  vehicleId: number,
  session: Session | string = 'NIGHT',
) =>
  (body.rows as any[]).find(
    (r) => r.vehicleId === vehicleId && r.deliverySession === session,
  ) ?? null;

/** opening / trays / returned / closing of one tray type in one grid row. */
export function trayCell(row: any, trayTypeId: number) {
  return {
    opening: row[`tray_${trayTypeId}_opening`],
    trays: row[`tray_${trayTypeId}`],
    returned: row[`tray_${trayTypeId}_returned`],
    closing: row[`tray_${trayTypeId}_closing`],
  };
}

/** Flattened leaf column nodes of the grid. */
export function leafColumns(nodes: any[]): any[] {
  return nodes.flatMap((x) =>
    x.children?.length ? leafColumns(x.children) : [x],
  );
}

// ---------------------------------------------------------------------------
// Scene building
// ---------------------------------------------------------------------------
/** A paper at a controlled sale date (day index k) with the given status, and a dairy header. */
export async function dtPaper(
  ctx: OrdersCtx,
  k: number,
  status: string = 'NIGHT_SUBMITTED',
  o: { header?: boolean } = {},
): Promise<TSheet> {
  const sheet = await ctx.world.newSheet({
    saleDate: saleDateOf(k),
    status: status as never,
  });
  if (o.header !== false) await ensureDairyHeader(ctx, sheet.paperId);
  return sheet;
}

/** One tray-bearing product supplied by distA, billed in the brandTray brand, and its tray type id. */
export async function trayProduct(ctx: OrdersCtx) {
  const p = await ctx.world.addProduct({ tray: true });
  return {
    p,
    dist: ctx.world.distA,
    trayTypeId: ctx.world.brandTray.trayTypeId!,
  };
}

/**
 * DB seam: one purchase entry (taken quantity) for a vehicle. `qty` is in order units (one unit = one tray, DT-6.4).
 * A frozen tray type is stored, as the Purchase save does.
 */
export async function buyTrays(
  ctx: OrdersCtx,
  paper: { paperId: number; saleDate: Date },
  v: { id: number },
  p: TProduct,
  dist: TDist,
  qty: number,
  o: { session?: Session; trayTypeId?: number | null } = {},
) {
  const pp = await ctx.db.purchase_paper.upsert({
    where: { order_paper_id: paper.paperId },
    update: {},
    create: { order_paper_id: paper.paperId },
  });
  return ctx.db.purchase_entry.create({
    data: {
      purchase_paper_id: pp.id,
      vehicle_id: v.id,
      product_id: p.id,
      purchased_qty: qty,
      purchase_amount: qty * 12 * 56,
      purchase_rate: 56,
      distributor_id: dist.id,
      gatepass_date: paper.saleDate,
      category: 'MILK' as never,
      product_link_id: p.links[dist.id],
      delivery_session: (o.session ?? 'NIGHT') as never,
      tray_type_id:
        o.trayTypeId === undefined
          ? ctx.world.brandTray.trayTypeId
          : o.trayTypeId,
      units_per_order_unit: 12,
      pricing_quantity: 12,
      pricing_unit: 'L' as never,
    },
  });
}

/**
 * Stores the ledger of a paper from its purchases and the earlier stored ledgers, and cascades to later papers,
 * by running the real forward-job body (DT-10.5). Creates the header when missing.
 */
export async function rebuildLedger(ctx: OrdersCtx, paperId: number) {
  const svc = ctx.app.get(DairyTraysPropagationService, { strict: false });
  return ctx.prisma.$transaction((tx) =>
    svc.propagateFromPaperChunk(paperId, null, 1000, tx),
  );
}

/**
 * One paper (day k, default NIGHT_SUBMITTED) with a header, one vehicle that bought `qty` trays in `session`
 * (default NIGHT), and the ledger stored from it. The default is the smallest paper on which a return can be saved.
 */
export async function ledgerScene(
  ctx: OrdersCtx,
  o: { k?: number; status?: string; qty?: number; session?: Session } = {},
) {
  const sheet = await dtPaper(ctx, o.k ?? 0, o.status ?? 'NIGHT_SUBMITTED');
  const tp = await trayProduct(ctx);
  const v = await addVehicle(ctx);
  await buyTrays(ctx, sheet, v, tp.p, tp.dist, o.qty ?? 10, {
    session: o.session,
  });
  await rebuildLedger(ctx, sheet.paperId);
  return {
    sheet,
    paperId: sheet.paperId,
    v,
    ...tp,
    qty: o.qty ?? 10,
    token: () => dtToken(ctx, sheet.paperId),
  };
}

/**
 * DB seam: sets the stored return (and the closing balance) of an existing stored line directly, without any
 * validation. Used to create legacy / stranded data (DT-7.2) and returns without going through the Dairy API.
 */
export async function setStoredReturn(
  ctx: OrdersCtx,
  paperId: number,
  v: { id: number },
  trayTypeId: number,
  returned: number,
  session: Session = 'NIGHT',
) {
  const row = await dtRow(ctx, paperId, v, trayTypeId, session);
  if (!row) throw new Error('setStoredReturn: no stored line');
  await ctx.db.dairy_tray_transaction.update({
    where: { id: row.id },
    data: {
      trays_returned: returned,
      closing_balance: row.opening_balance + row.trays_taken - returned,
    },
  });
}

/** DB seam: a stored line written directly (legacy rows, carried balances). */
export async function seedDairyLine(
  ctx: OrdersCtx,
  paperId: number,
  v: { id: number },
  trayTypeId: number,
  c: {
    opening?: number;
    taken?: number;
    returned?: number | null;
    session?: Session;
  },
) {
  const h = await ensureDairyHeader(ctx, paperId);
  const opening = c.opening ?? 0;
  const taken = c.taken ?? 0;
  const returned = c.returned === undefined ? 0 : c.returned;
  return ctx.db.dairy_tray_transaction.create({
    data: {
      dairy_tray_paper_id: h.id,
      vehicle_id: v.id,
      tray_type_id: trayTypeId,
      delivery_session: (c.session ?? 'NIGHT') as never,
      opening_balance: opening,
      trays_taken: taken,
      trays_returned: returned,
      closing_balance: opening + taken - (returned ?? 0),
    },
  });
}

export const setTrayActive = (
  ctx: OrdersCtx,
  trayTypeId: number,
  active: boolean,
) =>
  ctx.db.master_tray_type.update({
    where: { id: trayTypeId },
    data: { is_active: active },
  });

/** Call from afterEach. */
export async function cleanupDtTests(ctx: OrdersCtx) {
  vi.restoreAllMocks();
  await ctx.db.master_tray_type.updateMany({
    where: { brand_id: ctx.world.brandTray.id },
    data: { is_active: true },
  });
  await cleanupPuTests(ctx);
}
