/**
 * Thin glue for the Vehicle Allocation specs. Built ONLY on the Orders harness
 * (ctx.call, ctx.world, ctx.db, seedNight, ...). Nothing here is production code.
 */
import { vi } from 'vitest';
import {
  n,
  type ClientOpts,
  type OrdersCtx,
  type ProductOpts,
  type TDist,
  type TSheet,
} from './orders-harness.js';

export const STALE_VA =
  'Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';
export const RETRY_MSG =
  'Your request conflicted with another update and could not be completed. Please retry.';
export const TIMEOUT_MSG =
  'The request took too long and nothing was saved. Please retry.';
export const DROPPED_MSG =
  'Saving would remove existing vehicle allocations that are missing from the submitted data (they were neither kept nor set to 0). Confirm deletion to proceed.';

export type Session = 'NIGHT' | 'MORNING';
export type Veh = { id: number; name: string | null; number: string };
export const vname = (v: Veh) => v.name ?? v.number;

// ---------------------------------------------------------------------------
// Vehicles (the harness world has none). Removed again by cleanupVaTests.
// ---------------------------------------------------------------------------
let vehSeq = 0;
const vehicleIds: number[] = [];

export async function addVehicle(
  ctx: OrdersCtx,
  o: { name?: string | null; active?: boolean; capacity?: number } = {},
): Promise<Veh> {
  const k = ++vehSeq;
  const row = await ctx.db.master_vehicle.create({
    data: {
      vehicle_number: `TV-${ctx.world.sfx}-${k}`,
      vehicle_name:
        o.name === undefined ? `T-veh-${ctx.world.sfx}-${k}` : o.name,
      is_active: o.active ?? true,
      capacity: o.capacity ?? null,
    },
  });
  vehicleIds.push(row.id);
  return { id: row.id, name: row.vehicle_name, number: row.vehicle_number };
}

export const setVehicleActive = (
  ctx: OrdersCtx,
  v: { id: number },
  active: boolean,
) =>
  ctx.db.master_vehicle.update({
    where: { id: v.id },
    data: { is_active: active },
  });

export const setLinksActive = (
  ctx: OrdersCtx,
  links: Record<number, number>,
  active: boolean,
) =>
  ctx.db.master_product_link.updateMany({
    where: { id: { in: Object.values(links) } },
    data: { is_active: active },
  });

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
/** One allocation entry. */
export const al = (
  v: { id: number },
  d: { id: number },
  p: { id: number },
  qty: unknown,
  category = 'MILK',
) => ({
  vehicleId: v.id,
  distributorId: d.id,
  category,
  productId: p.id,
  allocatedQty: qty,
});

type WriteOpts = {
  session?: string | null;
  token?: string | null;
  extra?: Record<string, unknown>;
};

export const vaApi = (ctx: OrdersCtx) => {
  const path = (paperId: number | string) =>
    `/vehicle-allocations/${paperId}/vehicle-allocations`;
  const tok = (o: WriteOpts) =>
    o.token === undefined ? ctx.tokens.emp : o.token;
  return {
    /** session null = omit the query parameter. token null = no Authorization header. */
    get: (
      paperId: number | string,
      session: string | null = 'NIGHT',
      token: string | null = ctx.tokens.emp,
    ) =>
      ctx.call(
        'get',
        `${path(paperId)}${session === null ? '' : `?session=${session}`}`,
        token,
      ),

    /** expected undefined = omit the field; session null = omit the field. */
    save: (
      paperId: number | string,
      allocations: unknown,
      expected: string | null | undefined,
      o: WriteOpts & { confirm?: boolean } = {},
    ) => {
      const body: Record<string, unknown> = {
        allocations,
        session: o.session === undefined ? 'NIGHT' : o.session,
        expectedUpdatedAt: expected,
        ...(o.confirm === undefined ? {} : { confirmDeletions: o.confirm }),
        ...(o.extra ?? {}),
      };
      if (o.session === null) delete body.session;
      return ctx.call('post', path(paperId), tok(o), body);
    },

    reconcile: (
      paperId: number | string,
      expected: string | null | undefined,
      o: WriteOpts = {},
    ) => {
      const body: Record<string, unknown> = {
        session: o.session === undefined ? 'NIGHT' : o.session,
        expectedUpdatedAt: expected,
        ...(o.extra ?? {}),
      };
      if (o.session === null) delete body.session;
      return ctx.call('post', `${path(paperId)}/reconcile`, tok(o), body);
    },
  };
};

// ---------------------------------------------------------------------------
// DB reads
// ---------------------------------------------------------------------------
export const vaPaper = (
  ctx: OrdersCtx,
  paperId: number,
  session: Session = 'NIGHT',
) =>
  ctx.db.vehicle_allocation_paper.findUnique({
    where: {
      order_paper_id_delivery_session: {
        order_paper_id: paperId,
        delivery_session: session as never,
      },
    },
  });

export async function vaToken(
  ctx: OrdersCtx,
  paperId: number,
  session: Session = 'NIGHT',
) {
  return (
    (await vaPaper(ctx, paperId, session))?.updated_at.toISOString() ?? null
  );
}

export async function vaRows(
  ctx: OrdersCtx,
  paperId: number,
  session: Session = 'NIGHT',
) {
  const p = await vaPaper(ctx, paperId, session);
  return p
    ? ctx.db.vehicle_allocation.findMany({
        where: { vehicle_allocation_paper_id: p.id },
        orderBy: { id: 'asc' },
      })
    : [];
}

export async function vaAnomalies(
  ctx: OrdersCtx,
  paperId: number,
  session: Session = 'NIGHT',
) {
  const p = await vaPaper(ctx, paperId, session);
  return p
    ? ctx.db.vehicle_allocation_anomaly.findMany({
        where: { vehicle_allocation_paper_id: p.id },
        orderBy: { id: 'asc' },
      })
    : [];
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
export const gridOf = (
  body: any,
  distId: number,
  category = 'MILK',
  brandId?: number,
) =>
  body.allocations.find(
    (g: any) =>
      g.distributor.id === distId &&
      g.category === category &&
      (brandId === undefined || g.brand.id === brandId),
  );

export const cellOf = (grid: any, vehicleId: number, productId: number) =>
  grid.rows.find((r: any) => r.vehicleId === vehicleId)?.[
    `product_${productId}`
  ];

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------
/** One group, `clients` clients, ordered `qty` (default 10) of every product by every client, DRAFT. */
export async function demandScene(
  ctx: OrdersCtx,
  o: {
    qty?: number;
    products?: ProductOpts[];
    clients?: number;
    clientOpts?: Omit<ClientOpts, 'group'>;
  } = {},
) {
  const s = await ctx.world.scene({
    products: o.products ?? [{}],
    clients: o.clients ?? 1,
    clientOpts: o.clientOpts,
  });
  const q = o.qty ?? 10;
  await ctx.seedNight(
    s.sheet,
    s.clients.flatMap((c) => s.products.map((p) => n(c, p, q))),
  );
  return {
    ...s,
    c: s.clients[0],
    p: s.products[0],
    dist: ctx.world.distA,
    paperId: s.sheet.paperId,
  };
}

/**
 * One paper with a NIGHT sheet (demand `qtyNight`) and a MORNING sheet (demand `qtyMorning`) for the same
 * product. `morningSupplier` makes the morning client buy from another distributor.
 */
export async function twoSessionScene(
  ctx: OrdersCtx,
  o: {
    qtyNight?: number;
    qtyMorning?: number;
    productOpts?: ProductOpts;
    morningSupplier?: TDist;
  } = {},
) {
  const s = await ctx.world.scene({
    products: [o.productOpts ?? {}],
    clients: 1,
  });
  const [p] = s.products;
  const g2 = await ctx.world.addGroup();
  const c2 = await ctx.world.addClient({
    group: g2,
    ...(o.morningSupplier
      ? {
          categories: [
            { category: 'MILK', supplier: o.morningSupplier },
            { category: 'NON_MILK', supplier: o.morningSupplier },
          ],
        }
      : {}),
  });
  const row = await ctx.db.order_sheet.create({
    data: {
      order_paper_id: s.sheet.paperId,
      group_id: g2.id,
      delivery_session: 'MORNING',
    },
  });
  await ctx.db.order_sheet_product.create({
    data: { order_sheet_id: row.id, product_id: p.id },
  });
  const sheet2: TSheet = {
    paperId: s.sheet.paperId,
    sheetId: row.id,
    saleDate: s.sheet.saleDate,
    group: g2,
  };
  await ctx.seedNight(s.sheet, [n(s.clients[0], p, o.qtyNight ?? 4)]);
  await ctx.seedNight(sheet2, [n(c2, p, o.qtyMorning ?? 7)]);
  return {
    ...s,
    p,
    c1: s.clients[0],
    c2,
    sheet2,
    paperId: s.sheet.paperId,
    dist: ctx.world.distA,
  };
}

/** One product supplied by distA to client 1 (demand qtyA) and by distB to client 2 (demand qtyB). */
export async function splitScene(
  ctx: OrdersCtx,
  o: { qtyA?: number; qtyB?: number } = {},
) {
  const w = ctx.world;
  const s = await w.scene({
    products: [{ distributors: [{ dist: w.distA }, { dist: w.distB }] }],
    clients: 2,
  });
  const [c1, c2] = s.clients;
  await ctx.db.master_client_category.updateMany({
    where: { client_id: c2.id },
    data: { supplier_distributor_id: w.distB.id },
  });
  const p = s.products[0];
  await ctx.seedNight(s.sheet, [n(c1, p, o.qtyA ?? 4), n(c2, p, o.qtyB ?? 6)]);
  return { ...s, p, c1, c2, paperId: s.sheet.paperId, A: w.distA, B: w.distB };
}

export const setSheetSession = (
  ctx: OrdersCtx,
  sheetId: number,
  session: Session,
) =>
  ctx.db.order_sheet.update({
    where: { id: sheetId },
    data: { delivery_session: session },
  });

/** Change the ordered quantity of one line while the paper is DRAFT (Orders night save). */
export const setDemand = (
  ctx: OrdersCtx,
  sheet: TSheet,
  client: { id: number },
  product: { id: number },
  qty: number,
) => ctx.seedNight(sheet, [n(client, product, qty)]);

/** DB seam: stored allocation rows (creates the allocation paper if needed). */
export async function seedAlloc(
  ctx: OrdersCtx,
  paperId: number,
  rows: {
    vehicleId: number;
    distributorId: number;
    productId: number;
    qty: number;
    snapshot?: number | null;
    category?: string;
  }[],
  session: Session = 'NIGHT',
) {
  const paper = await ctx.db.vehicle_allocation_paper.upsert({
    where: {
      order_paper_id_delivery_session: {
        order_paper_id: paperId,
        delivery_session: session as never,
      },
    },
    update: {},
    create: { order_paper_id: paperId, delivery_session: session as never },
  });
  if (rows.length > 0) {
    await ctx.db.vehicle_allocation.createMany({
      data: rows.map((r) => ({
        vehicle_allocation_paper_id: paper.id,
        vehicle_id: r.vehicleId,
        distributor_id: r.distributorId,
        product_id: r.productId,
        allocated_qty: r.qty,
        required_qty_at_save: r.snapshot === undefined ? null : r.snapshot,
        category: (r.category ?? 'MILK') as never,
      })),
    });
  }
  return paper;
}

/** DB seam: one anomaly record. */
export const seedAnomaly = (
  ctx: OrdersCtx,
  paperAllocId: number,
  c: {
    vehicleId: number;
    distributorId: number;
    productId: number;
    qty: number;
    status?: 'FLAGGED' | 'RECONCILED';
    reason?: string;
  },
) =>
  ctx.db.vehicle_allocation_anomaly.create({
    data: {
      vehicle_allocation_paper_id: paperAllocId,
      vehicle_id: c.vehicleId,
      distributor_id: c.distributorId,
      category: 'MILK' as never,
      product_id: c.productId,
      removed_qty: c.qty,
      reason: (c.reason ?? 'NOT_REQUIRED') as never,
      status: (c.status ?? 'FLAGGED') as never,
      ...(c.status === 'RECONCILED' ? { reconciled_at: new Date() } : {}),
    },
  });

/** Call from afterEach: restores mocks, removes papers (cascades allocations / anomalies) and test vehicles. */
export async function cleanupVaTests(ctx: OrdersCtx) {
  vi.restoreAllMocks();
  await ctx.world.deletePapers();
  const ids = vehicleIds.splice(0);
  if (ids.length > 0)
    await ctx.db.master_vehicle.deleteMany({ where: { id: { in: ids } } });
}
