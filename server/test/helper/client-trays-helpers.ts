/**
 * Thin glue for the Client Trays specs. Built ONLY on the existing orders harness
 * (ctx.call, ctx.world, ctx.db, seedNight, ...). No new application bootstrap.
 * If you prefer, inline these into the specs; nothing here is production code.
 */
import { vi } from 'vitest';
import { n, type OrdersCtx, type ProductOpts } from './orders-harness.js';

export const STALE =
  'Client Trays data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';
export const TIMEOUT_MSG =
  'The request took too long and nothing was saved. Please retry.';
export const RETRY_MSG =
  'Your request conflicted with another update and could not be completed. Please retry.';
export const DISCREPANCY =
  'This change would leave returned trays higher than the outstanding balance. Correct the returns first, then repeat the change';

const DAY = 86_400_000;
export const addDays = (d: Date, k: number) => new Date(d.getTime() + k * DAY);
export const utc = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The brand tray type created by the harness world. */
export const tt = (ctx: OrdersCtx) => ctx.world.brandTray.trayTypeId!;

/** One save entry. */
export const ret = (
  clientId: number,
  trayTypeId: number,
  returned: unknown,
  category = 'MILK',
) => ({
  clientId,
  trayTypeId,
  category,
  returned,
});

export const traysApi = (ctx: OrdersCtx) => ({
  get: (sheetId: number | string, token: string = ctx.tokens.emp) =>
    ctx.call('get', `/client-trays/sheet/${sheetId}`, token),
  /** `expected: undefined` omits the field from the JSON body. */
  save: (
    sheetId: number | string,
    entries: unknown[],
    expected: string | null | undefined,
    token: string = ctx.tokens.emp,
  ) =>
    ctx.call('post', `/client-trays/sheet/${sheetId}/save`, token, {
      entries,
      expectedUpdatedAt: expected,
    }),
  reconcile: (
    sheetId: number | string,
    entries: unknown[],
    expected: string | null | undefined,
    token: string = ctx.tokens.admin,
  ) =>
    ctx.call(
      'post',
      `/client-trays/sheet/${sheetId}/reconcile-inactive`,
      token,
      { entries, expectedUpdatedAt: expected },
    ),
  recalc: (
    fromDate: string,
    toDate: string,
    token: string = ctx.tokens.admin,
  ) =>
    ctx.call('post', '/client-trays/recalculate', token, { fromDate, toDate }),
});

/** CT-9 token of a sheet (order_sheet.client_trays_updated_at) as an ISO string. */
export const trayToken = async (ctx: OrdersCtx, sheetId: number) =>
  (await ctx.sheetRow(sheetId)).client_trays_updated_at?.toISOString() ?? null;

export const cell = (row: any, trayTypeId: number) => ({
  opening: row?.[`tray_${trayTypeId}_opening`],
  taken: row?.[`tray_${trayTypeId}`],
  returned: row?.[`tray_${trayTypeId}_returned`],
  closing: row?.[`tray_${trayTypeId}_closing`],
});

export const rowOf = (
  body: any,
  grid: 'milkTrayGrid' | 'nonMilkTrayGrid',
  clientId: number,
) => body[grid].rows.find((r: any) => r.clientId === clientId);

export type ColNode = {
  headerName: string;
  field?: string;
  editable?: boolean;
  pinned?: string;
  children?: ColNode[];
};
export const leaves = (nodes: ColNode[]): ColNode[] =>
  nodes.flatMap((x) => (x.children?.length ? leaves(x.children) : [x]));

/** Direct ledger row (bypasses every module; used as stored state / earlier-sheet history). */
export const seedLedger = (
  ctx: OrdersCtx,
  sheetId: number,
  clientId: number,
  trayTypeId: number,
  v: {
    opening?: number;
    taken?: number;
    returned?: number | null;
    closing: number;
    category?: 'MILK' | 'NON_MILK';
  },
) =>
  ctx.db.client_tray_transaction.create({
    data: {
      order_sheet_id: sheetId,
      client_id: clientId,
      tray_type_id: trayTypeId,
      category: (v.category ?? 'MILK') as never,
      opening_balance: v.opening ?? 0,
      trays_taken: v.taken ?? 0,
      trays_returned: v.returned === undefined ? 0 : v.returned,
      closing_balance: v.closing,
    },
  });

/** Sheet with tray ordering saved (ordered `qty` per client and product) in the given status. */
export async function submittedWithTrays(
  ctx: OrdersCtx,
  o: {
    qty?: number;
    clients?: number;
    products?: ProductOpts[];
    saleDate?: Date;
    status?: string;
  } = {},
) {
  const s = await ctx.world.scene({
    products: o.products ?? [{ tray: true }],
    clients: o.clients ?? 1,
    ...(o.saleDate ? { saleDate: o.saleDate } : {}),
  });
  await ctx.seedNight(
    s.sheet,
    s.clients.flatMap((c) => s.products.map((p) => n(c, p, o.qty ?? 5))),
  );
  const status = o.status ?? 'NIGHT_SUBMITTED';
  if (status !== 'DRAFT') await ctx.setStatus(s.sheet, status as never);
  return s;
}

/** Another tray type of the same brand (unique colour, cleaned by cleanupTrayTests). */
export async function extraTrayType(ctx: OrdersCtx) {
  const base = await ctx.db.master_tray_type.findUniqueOrThrow({
    where: { id: tt(ctx) },
  });
  return ctx.db.master_tray_type.create({
    data: {
      brand_id: base.brand_id,
      color: `T-extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

/**
 * Sheet of a fresh group on `saleDate` plus an EARLIER sheet of the same group whose ledger closed
 * with `opening` trays for the client (tray type = brand tray, MILK). `qty` > 0 also saves that many
 * crates of ordering on the sheet.
 */
export async function sheetWithOpening(
  ctx: OrdersCtx,
  saleDate: Date,
  opening: number,
  qty: number,
  status = 'NIGHT_SUBMITTED',
) {
  const s = await ctx.world.scene({
    products: [{ tray: true }],
    clients: 1,
    saleDate,
  });
  const [c] = s.clients;
  const [p] = s.products;
  const prev = await ctx.world.newSheet({
    group: s.group,
    saleDate: addDays(saleDate, -1),
  });
  await seedLedger(ctx, prev.sheetId, c.id, tt(ctx), {
    taken: opening,
    closing: opening,
  });
  if (qty > 0) await ctx.seedNight(s.sheet, [n(c, p, qty)]);
  if (status !== 'DRAFT') await ctx.setStatus(s.sheet, status as never);
  return { ...s, c, p, prev };
}

/** Client with open balances on two tray types (X = brand tray, Y = extra) on the previous sheet. */
export async function twoTraySheet(
  ctx: OrdersCtx,
  saleDate: Date,
  status = 'NIGHT_SUBMITTED',
) {
  const s = await ctx.world.scene({
    products: [{ tray: true }],
    clients: 1,
    saleDate,
  });
  const c = s.clients[0];
  const X = tt(ctx);
  const Y = (await extraTrayType(ctx)).id;
  const prev = await ctx.world.newSheet({
    group: s.group,
    saleDate: addDays(saleDate, -1),
  });
  await seedLedger(ctx, prev.sheetId, c.id, X, { taken: 3, closing: 3 });
  await seedLedger(ctx, prev.sheetId, c.id, Y, { taken: 4, closing: 4 });
  await ctx.setStatus(s.sheet, status as never);
  return { ...s, c, X, Y, prev };
}

export const outboxOf = (ctx: OrdersCtx, paperId: number) =>
  ctx.db.propagation_outbox.findMany({
    where: { paper_id: paperId },
    orderBy: { id: 'asc' },
  });

/** Call from afterEach: restores mocks and tray activity, removes outbox rows, papers and extra tray types. */
export async function cleanupTrayTests(ctx: OrdersCtx) {
  vi.restoreAllMocks();
  await ctx.db.master_tray_type.updateMany({
    where: { id: tt(ctx) },
    data: { is_active: true },
  });
  const papers = await ctx.db.order_paper.findMany({
    where: { sale_date: { gte: new Date('2090-01-01') } },
    select: { id: true },
  });
  await ctx.db.propagation_outbox.deleteMany({
    where: { paper_id: { in: papers.map((p) => p.id) } },
  });
  await ctx.world.deletePapers();
  await ctx.db.master_tray_type.deleteMany({
    where: { color: { startsWith: 'T-extra' } },
  });
}
