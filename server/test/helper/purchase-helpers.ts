/**
 * Thin glue for the Purchase specs. Built ONLY on the Orders harness and the Vehicle Allocation helpers.
 * Nothing here is production code.
 */
import { vi } from 'vitest';
import { type OrdersCtx, type ProductOpts, iso } from './orders-harness.js';
import {
  addVehicle,
  al,
  cleanupVaTests,
  demandScene,
  twoSessionScene,
  vaApi,
  vaRows,
  type Session,
} from './vehicle-allocation-helpers.js';

export {
  RETRY_MSG,
  TIMEOUT_MSG,
  addVehicle,
  al,
  demandScene,
  seedAlloc,
  setLinksActive,
  vaApi,
  vaRows,
  vaToken,
  vname,
} from './vehicle-allocation-helpers.js';
export { iso };

export const STALE_PU =
  'Purchase data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';
export const EDIT_NOT_ALLOWED =
  'Purchases cannot be edited in current workflow state';
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const addDays = (d: Date, k: number) => new Date(d.getTime() + k * DAY);
/** Start (UTC instant) of the IST calendar day of a UTC-midnight calendar date. */
export const istStart = (d: Date) => new Date(d.getTime() - 5.5 * HOUR);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
type WriteOpts = { token?: string | null; extra?: Record<string, unknown> };

export const puApi = (ctx: OrdersCtx) => {
  const path = (id: number | string) => `/purchases/${id}`;
  return {
    get: (id: number | string, token: string | null = ctx.tokens.emp) =>
      ctx.call('get', path(id), token),
    /** expected undefined = omit the field */
    save: (
      id: number | string,
      entries: unknown,
      expected: string | null | undefined,
      o: WriteOpts = {},
    ) =>
      ctx.call(
        'post',
        path(id),
        o.token === undefined ? ctx.tokens.emp : o.token,
        {
          entries,
          expectedUpdatedAt: expected,
          ...(o.extra ?? {}),
        },
      ),
    recalc: (
      id: number | string,
      expected: string | null | undefined,
      reason: unknown,
      o: WriteOpts = {},
    ) =>
      ctx.call(
        'post',
        `${path(id)}/recalculate-rates`,
        o.token === undefined ? ctx.tokens.admin : o.token,
        {
          expectedUpdatedAt: expected,
          reason,
          ...(o.extra ?? {}),
        },
      ),
    signOff: (
      id: number | string,
      expected: string | null | undefined,
      o: WriteOpts = {},
    ) =>
      ctx.call(
        'post',
        `${path(id)}/sign-off-zero-allocation`,
        o.token === undefined ? ctx.tokens.emp : o.token,
        {
          expectedUpdatedAt: expected,
          ...(o.extra ?? {}),
        },
      ),
  };
};

// ---------------------------------------------------------------------------
// DB reads
// ---------------------------------------------------------------------------
export const puPaper = (ctx: OrdersCtx, paperId: number) =>
  ctx.db.purchase_paper.findUnique({ where: { order_paper_id: paperId } });

export async function puToken(ctx: OrdersCtx, paperId: number) {
  return (await puPaper(ctx, paperId))?.updated_at.toISOString() ?? null;
}

export async function puEntries(ctx: OrdersCtx, paperId: number) {
  const p = await puPaper(ctx, paperId);
  return p
    ? ctx.db.purchase_entry.findMany({
        where: { purchase_paper_id: p.id },
        orderBy: { id: 'asc' },
      })
    : [];
}

export async function dairyRows(ctx: OrdersCtx, paperId: number) {
  const h = await ctx.db.dairy_tray_paper.findUnique({
    where: { order_paper_id: paperId },
  });
  return h
    ? ctx.db.dairy_tray_transaction.findMany({
        where: { dairy_tray_paper_id: h.id },
        orderBy: { id: 'asc' },
      })
    : [];
}

export const ensureDairyHeader = (ctx: OrdersCtx, paperId: number) =>
  ctx.db.dairy_tray_paper.upsert({
    where: { order_paper_id: paperId },
    update: {},
    create: { order_paper_id: paperId },
  });

export async function allocRow(
  ctx: OrdersCtx,
  paperId: number,
  vehicleId: number,
  productId: number,
  session: Session = 'NIGHT',
) {
  return (
    (await vaRows(ctx, paperId, session)).find(
      (r) => r.vehicle_id === vehicleId && r.product_id === productId,
    ) ?? null
  );
}

/** DB seam: break the order-unit configuration of a product (units and pricing quantity 0). */
export async function breakOrderUnit(ctx: OrdersCtx, productId: number) {
  const p = await ctx.db.master_product.findUniqueOrThrow({
    where: { id: productId },
  });
  await ctx.db.product_order_unit.update({
    where: { id: p.product_order_unit_id },
    data: { units_per_order_unit: 0, pricing_quantity: 0 },
  });
}

/** DB seam: lower or raise the stored allocation quantity of one cell. */
export const setAllocQty = (ctx: OrdersCtx, rowId: number, qty: number) =>
  ctx.db.vehicle_allocation.update({
    where: { id: rowId },
    data: { allocated_qty: qty },
  });

// ---------------------------------------------------------------------------
// Entries and response helpers
// ---------------------------------------------------------------------------
/**
 * One purchase entry. `echo` true (default) reads the CURRENT allocation of the cell from the database and
 * sends it back as sourceAllocationId / sourceAllocatedQty (PD-4). echo false sends none.
 */
export async function pe(
  ctx: OrdersCtx,
  paperId: number,
  v: { id: number },
  d: { id: number },
  p: { id: number },
  qty: unknown,
  o: { session?: Session; category?: string; echo?: boolean } = {},
) {
  const session = o.session ?? 'NIGHT';
  const entry: Record<string, unknown> = {
    vehicleId: v.id,
    deliverySession: session,
    distributorId: d.id,
    category: o.category ?? 'MILK',
    productId: p.id,
    purchasedQty: qty,
  };
  if (o.echo !== false) {
    const row = await allocRow(ctx, paperId, v.id, p.id, session);
    if (row) {
      entry.sourceAllocationId = row.id;
      entry.sourceAllocatedQty = Number(row.allocated_qty);
    }
  }
  return entry;
}

export function cellOf(
  body: any,
  distId: number,
  vehicleId: number,
  productId: number,
  session = 'NIGHT',
  category = 'MILK',
) {
  const f = `product_${productId}`;
  for (const g of body.purchases) {
    if (g.distributor.id !== distId || g.category !== category) continue;
    const row = g.rows.find(
      (r: any) => r.vehicleId === vehicleId && r.deliverySession === session,
    );
    if (row && f in row) {
      return {
        qty: row[f],
        rate: row[`${f}_rate`],
        amount: row[`${f}_amount`],
        meta: row[`${f}_meta`],
        stale: row[`${f}_stale`],
        variance: row[`${f}_variance`],
        row,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------
/**
 * One group, one client, `qty` ordered of every product. Every product listed in `allocFor` (default all)
 * is allocated `alloc` (default = qty) to vehicle v1 in DRAFT, then the paper is moved to `status`
 * (default NIGHT_SUBMITTED, where purchases are editable). alloc 0 = no allocation at all.
 */
export async function purchaseScene(
  ctx: OrdersCtx,
  o: {
    qty?: number;
    alloc?: number;
    products?: ProductOpts[];
    allocFor?: number[];
    status?: string;
  } = {},
) {
  const qty = o.qty ?? 10;
  const s = await demandScene(ctx, { qty, products: o.products ?? [{}] });
  const v1 = await addVehicle(ctx);
  const v2 = await addVehicle(ctx);
  const alloc = o.alloc ?? qty;
  if (alloc > 0) {
    const idx = o.allocFor ?? s.products.map((_, i) => i);
    const entries = idx.map((i) =>
      al(
        v1,
        s.dist,
        s.products[i],
        alloc,
        String(o.products?.[i]?.category ?? 'MILK'),
      ),
    );
    const r = await vaApi(ctx).save(s.paperId, entries, null);
    if (r.status !== 200)
      throw new Error(
        `purchaseScene: allocation failed ${JSON.stringify(r.body)}`,
      );
  }
  await ensureDairyHeader(ctx, s.paperId);
  await ctx.setStatus(s.sheet, (o.status ?? 'NIGHT_SUBMITTED') as never);
  return { ...s, v1, v2, qty, alloc };
}

/** NIGHT demand/allocation `qn` and MORNING demand/allocation `qm` for one product and one vehicle. */
export async function twoSessionPurchaseScene(
  ctx: OrdersCtx,
  o: {
    qn?: number;
    qm?: number;
    nightAlloc?: boolean;
    morningAlloc?: boolean;
    status?: string;
  } = {},
) {
  const qn = o.qn ?? 4;
  const qm = o.qm ?? 7;
  const t = await twoSessionScene(ctx, { qtyNight: qn, qtyMorning: qm });
  const v = await addVehicle(ctx);
  const va = vaApi(ctx);
  if (o.nightAlloc !== false) {
    const r = await va.save(t.paperId, [al(v, t.dist, t.p, qn)], null, {
      session: 'NIGHT',
    });
    if (r.status !== 200)
      throw new Error(`night allocation failed ${JSON.stringify(r.body)}`);
  }
  if (o.morningAlloc !== false) {
    const r = await va.save(t.paperId, [al(v, t.dist, t.p, qm)], null, {
      session: 'MORNING',
    });
    if (r.status !== 200)
      throw new Error(`morning allocation failed ${JSON.stringify(r.body)}`);
  }
  await ensureDairyHeader(ctx, t.paperId);
  await ctx.setStatus(t.sheet, (o.status ?? 'NIGHT_SUBMITTED') as never);
  return { ...t, v, qn, qm };
}

/** Call from afterEach. */
export async function cleanupPuTests(ctx: OrdersCtx) {
  vi.restoreAllMocks();
  await ctx.db.master_brand.updateMany({
    where: { id: ctx.world.brandPlain.id },
    data: { gatepass_date_policy: 'SAME_DAY' as never },
  });
  await ctx.db.product_tray_rule.updateMany({
    where: { brand_id: ctx.world.brandTray.id },
    data: { is_active: true },
  });
  const papers = await ctx.db.order_paper.findMany({
    where: { sale_date: { gte: new Date('2090-01-01') } },
    select: { id: true },
  });
  await ctx.db.propagation_outbox.deleteMany({
    where: { paper_id: { in: papers.map((p) => p.id) } },
  });
  await cleanupVaTests(ctx);
}
