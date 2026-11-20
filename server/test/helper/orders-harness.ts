/**
 * Orders scenario test harness.
 *
 * - Boots OrdersModule + AuthModule against the REAL test database
 *   (milk_distribution_test, guarded by ./db.ts).
 * - Redis/BullMQ is NOT needed: the queue, the relay and the processor are
 *   stubbed. Outbox rows are still written to the DB and stay PENDING.
 * - Builds its own master data ("world") with unique names and removes it
 *   again. It does not rely on the seed.
 * - Papers use sale dates from 2091 onwards so they never collide with real data.
 */
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect } from 'vitest';

import { testPrisma as db } from './db.js';
import {
  DeliverySession,
  OrderPaperStatus,
  PricingUnit,
  SupplyCategory,
} from '../../src/generated/prisma/client.js';
import { PrismaModule } from '../../src/prisma/prisma.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { AuthModule } from '../../src/modules/transactions/auth/auth.module.js';
import { OrdersModule } from '../../src/modules/transactions/orders/orders.module.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';
import { RequestIdMiddleware } from '../../src/common/middleware/request-id.middleware.js';
import { UserThrottlerGuard } from '../../src/common/guards/user-throttler.guard.js';
import { PropagationOutboxRelayService } from '../../src/modules/transactions/propagation-queue/propagation-outbox.relay.service.js';
import { PropagationQueueProcessor } from '../../src/modules/transactions/propagation-queue/propagation-queue.processor.js';
import { PROPAGATION_QUEUE } from '../../src/modules/transactions/propagation-queue/propagation-queue.constants.js';
import { VehicleAllocationModule } from '../../src/modules/transactions/vehicle-allocation/vehicle-allocation.module.js';
import { PurchaseModule } from '../../src/modules/transactions/purchase/purchase.module.js';
import { CollectionsModule } from '../../src/modules/transactions/collections/collections.module.js';

process.env.SECRET ??= 'orders-test-secret';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';

export const DAY = 24 * 60 * 60 * 1000;
export const STALE_MESSAGE =
  'Order data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
export const iso = (d: Date) => d.toISOString().slice(0, 10);

export type ColumnNode = {
  headerName: string;
  field?: string;
  children?: ColumnNode[];
};
export function leafFields(nodes: ColumnNode[]): string[] {
  return nodes.flatMap((x) =>
    x.children?.length ? leafFields(x.children) : x.field ? [x.field] : [],
  );
}
export function pathTo(
  nodes: ColumnNode[],
  field: string,
  trail: string[] = [],
): string[] | null {
  for (const x of nodes) {
    const t = [...trail, x.headerName];
    if (x.field === field) return t;
    const r = pathTo(x.children ?? [], field, t);
    if (r) return r;
  }
  return null;
}

type Id = { id: number };
export const n = (c: Id, p: Id, orderedQty?: number | string | null) => ({
  clientId: c.id,
  productId: p.id,
  orderedQty,
});
export const m = (c: Id, p: Id, deliveredQty?: number | string | null) => ({
  clientId: c.id,
  productId: p.id,
  deliveredQty,
});

export type TDist = { id: number; name: string };
export type TGroup = { id: number; name: string };
export type TClient = { id: number; name: string };
export type TBrand = {
  id: number;
  types: Record<string, number>;
  trayTypeId: number | null;
};
export type TProduct = {
  id: number;
  code: string;
  size: number;
  links: Record<number, number>; // distributorId -> product_link id
};
export type TSheet = {
  paperId: number;
  sheetId: number;
  saleDate: Date;
  group: TGroup;
};
export type ProductOpts = {
  category?: SupplyCategory;
  brand?: TBrand;
  tray?: boolean;
  code?: string;
  showByDefault?: boolean;
  active?: boolean;
  gst?: number;
  inclusive?: boolean;
  units?: number;
  pricingQty?: number;
  pricingUnit?: PricingUnit;
  displayOrder?: number | null;
  distributors?: { dist: TDist; rate?: number | null; linkActive?: boolean }[];
};
export type ClientOpts = {
  group?: TGroup;
  name?: string;
  owner?: TDist;
  active?: boolean;
  categories?: { category: SupplyCategory; supplier: TDist }[];
};

// ---------------------------------------------------------------------------
// World: master data + papers
// ---------------------------------------------------------------------------
export async function createWorld() {
  // leftovers of a crashed earlier run
  await db.order_paper.deleteMany({
    where: {
      sale_date: {
        gte: new Date(Date.UTC(2091, 0, 1)),
        lt: new Date(Date.UTC(2100, 0, 1)),
      },
    },
  });

  const sfx = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const seq = {
    brand: 0,
    dist: 0,
    client: 0,
    group: 0,
    size: 0,
    date: 0,
    user: 0,
  };
  const cleanups: (() => Promise<unknown>)[] = [];
  const papers: number[] = [];

  const dairy = await db.master_dairy.create({
    data: { name: `T-dairy-${sfx}` },
  });
  cleanups.push(() => db.master_dairy.deleteMany({ where: { id: dairy.id } }));
  const unitType = await db.master_order_unit_type.create({
    data: { name: `T-crate-${sfx}` },
  });
  cleanups.push(() =>
    db.master_order_unit_type.deleteMany({ where: { id: unitType.id } }),
  );
  const packName = `T-pack-${sfx}`;
  const pack = await db.master_packaging_type.create({
    data: { name: packName },
  });
  cleanups.push(() =>
    db.master_packaging_type.deleteMany({ where: { id: pack.id } }),
  );
  const milkGroup = await db.master_product_group.create({
    data: { name: `T-milk-${sfx}`, category: SupplyCategory.MILK },
  });
  const nmGroup = await db.master_product_group.create({
    data: { name: `T-nonmilk-${sfx}`, category: SupplyCategory.NON_MILK },
  });
  cleanups.push(() =>
    db.master_product_group.deleteMany({
      where: { id: { in: [milkGroup.id, nmGroup.id] } },
    }),
  );

  async function addRules(d: TDist, b: TBrand) {
    for (const g of [milkGroup, nmGroup]) {
      const r = await db.distributor_procurement_rule.create({
        data: {
          distributor_id: d.id,
          brand_id: b.id,
          product_group_id: g.id,
          category: g.category,
          is_active: true,
        },
      });
      cleanups.push(() =>
        db.distributor_procurement_rule.deleteMany({ where: { id: r.id } }),
      );
    }
  }

  async function addDistributor(
    o: { active?: boolean; rulesFor?: TBrand[] } = {},
  ): Promise<TDist> {
    const d = await db.master_distributor.create({
      data: {
        name: `T-dist-${sfx}-${++seq.dist}`,
        is_active: o.active ?? true,
      },
    });
    cleanups.push(() =>
      db.master_distributor.deleteMany({ where: { id: d.id } }),
    );
    const dist = { id: d.id, name: d.name };
    for (const b of o.rulesFor ?? [brandPlain, brandTray])
      await addRules(dist, b);
    return dist;
  }

  async function addBrand(
    o: { rules?: boolean; tray?: boolean } = {},
  ): Promise<TBrand> {
    const b = await db.master_brand.create({
      data: { name: `T-brand-${sfx}-${++seq.brand}`, dairy_id: dairy.id },
    });
    cleanups.push(() => db.master_brand.deleteMany({ where: { id: b.id } }));
    const types: Record<string, number> = {};
    for (const c of [SupplyCategory.MILK, SupplyCategory.NON_MILK]) {
      const t = await db.master_product_type.create({
        data: { brand_id: b.id, name: `T-type-${c}` },
      });
      cleanups.push(() =>
        db.master_product_type.deleteMany({ where: { id: t.id } }),
      );
      types[c] = t.id;
    }
    const brand: TBrand = { id: b.id, types, trayTypeId: null };
    if (o.rules !== false)
      for (const d of [distA, distB]) await addRules(d, brand);
    if (o.tray) {
      const tray = await db.master_tray_type.create({
        data: { brand_id: b.id, color: `T${sfx}` },
      });
      cleanups.push(() =>
        db.master_tray_type.deleteMany({ where: { id: tray.id } }),
      );
      const rule = await db.product_tray_rule.create({
        data: {
          brand_id: b.id,
          tray_type_id: tray.id,
          applies_to_packaging: false,
        },
      });
      cleanups.push(() =>
        db.product_tray_rule.deleteMany({ where: { id: rule.id } }),
      );
      brand.trayTypeId = tray.id;
    }
    return brand;
  }

  const distA: TDist = await addDistributor({ rulesFor: [] });
  const distB: TDist = await addDistributor({ rulesFor: [] });
  const brandPlain: TBrand = await addBrand({});
  const brandTray: TBrand = await addBrand({ tray: true });

  async function addDistRate(
    linkId: number,
    rate: number,
    o: { from?: Date; to?: Date | null } = {},
  ) {
    const r = await db.distributor_product_rate.create({
      data: {
        product_link_id: linkId,
        purchase_rate: rate,
        selling_rate: rate,
        effective_from: o.from ?? new Date('2000-01-01T00:00:00Z'),
        effective_to: o.to ?? null,
        is_active: true,
      },
    });
    cleanups.push(() =>
      db.distributor_product_rate.deleteMany({ where: { id: r.id } }),
    );
    return r;
  }

  async function addClientRate(
    client: Id,
    linkId: number,
    rate: number,
    from: Date,
  ) {
    const r = await db.master_client_rate_product.create({
      data: {
        client_id: client.id,
        product_link_id: linkId,
        selling_rate: rate,
        effective_from: from,
      },
    });
    cleanups.push(() =>
      db.master_client_rate_product.deleteMany({ where: { id: r.id } }),
    );
    return r;
  }

  async function addProduct(o: ProductOpts = {}): Promise<TProduct> {
    const category = o.category ?? SupplyCategory.MILK;
    const brand = o.brand ?? (o.tray ? brandTray : brandPlain);
    const group = category === SupplyCategory.MILK ? milkGroup : nmGroup;
    const unit = await db.product_order_unit.create({
      data: {
        order_unit_type_id: unitType.id,
        units_per_order_unit: o.units ?? 12,
        pricing_quantity: o.pricingQty ?? 12,
        pricing_unit: o.pricingUnit ?? PricingUnit.L,
      },
    });
    cleanups.push(() =>
      db.product_order_unit.deleteMany({ where: { id: unit.id } }),
    );
    const size = ++seq.size;
    const p = await db.master_product.create({
      data: {
        code: o.code ?? `T${sfx}P${size}`,
        brand_id: brand.id,
        product_group_id: group.id,
        product_type_id: brand.types[category],
        packaging_type_id:
          category === SupplyCategory.NON_MILK ? pack.id : null,
        packaging_size: size,
        packaging_unit: 'L',
        gst_percentage: o.gst ?? 0,
        is_gst_inclusive: o.inclusive ?? false,
        show_by_default: o.showByDefault ?? false,
        display_order: o.displayOrder ?? null,
        is_active: o.active ?? true,
        product_order_unit_id: unit.id,
      },
    });
    cleanups.push(() => db.master_product.deleteMany({ where: { id: p.id } }));
    const links: Record<number, number> = {};
    for (const d of o.distributors ?? [{ dist: distA }]) {
      const link = await db.master_product_link.create({
        data: {
          distributor_id: d.dist.id,
          product_id: p.id,
          is_active: d.linkActive ?? true,
        },
      });
      cleanups.push(() =>
        db.master_product_link.deleteMany({ where: { id: link.id } }),
      );
      links[d.dist.id] = link.id;
      const rate = d.rate === undefined ? 56 : d.rate;
      if (rate !== null) await addDistRate(link.id, rate);
    }
    return { id: p.id, code: p.code!, size, links };
  }

  async function addGroup(): Promise<TGroup> {
    const g = await db.master_group.create({
      data: { name: `T-grp-${sfx}-${++seq.group}` },
    });
    cleanups.push(() => db.master_group.deleteMany({ where: { id: g.id } }));
    return { id: g.id, name: g.name };
  }

  async function addClient(o: ClientOpts = {}): Promise<TClient> {
    const group = o.group ?? (await addGroup());
    const owner = o.owner ?? distA;
    const c = await db.master_client.create({
      data: {
        name: o.name ?? `T-client-${sfx}-${++seq.client}`,
        delivery_group_id: group.id,
        owner_distributor_id: owner.id,
        is_active: o.active ?? true,
      },
    });
    cleanups.push(() => db.master_client.deleteMany({ where: { id: c.id } }));
    const cats = o.categories ?? [
      { category: SupplyCategory.MILK, supplier: distA },
      { category: SupplyCategory.NON_MILK, supplier: distA },
    ];
    for (const cat of cats) {
      await db.master_client_category.create({
        data: {
          client_id: c.id,
          category: cat.category,
          supplier_distributor_id: cat.supplier.id,
        },
      });
    }
    cleanups.push(() =>
      db.master_client_category.deleteMany({ where: { client_id: c.id } }),
    );
    return { id: c.id, name: c.name };
  }

  async function addPriority(
    group: TGroup,
    product: Id,
    dist: TDist,
    priority: number,
  ) {
    const r = await db.distributor_product_priority.create({
      data: {
        group_id: group.id,
        product_id: product.id,
        distributor_id: dist.id,
        priority,
      },
    });
    cleanups.push(() =>
      db.distributor_product_priority.deleteMany({ where: { id: r.id } }),
    );
  }

  async function newSheet(
    o: {
      status?: OrderPaperStatus;
      group?: TGroup;
      products?: TProduct[];
      saleDate?: Date;
    } = {},
  ): Promise<TSheet> {
    const group = o.group ?? (await addGroup());
    const saleDate =
      o.saleDate ?? new Date(Date.UTC(2091, 0, 1) + (++seq.date + 1) * DAY);
    const paper = await db.order_paper.create({
      data: {
        order_date: new Date(saleDate.getTime() - DAY),
        sale_date: saleDate,
        status: o.status ?? OrderPaperStatus.DRAFT,
      },
    });
    papers.push(paper.id);
    cleanups.push(() => db.order_paper.deleteMany({ where: { id: paper.id } }));
    const sheet = await db.order_sheet.create({
      data: {
        order_paper_id: paper.id,
        group_id: group.id,
        delivery_session: DeliverySession.NIGHT,
      },
    });
    const ts: TSheet = {
      paperId: paper.id,
      sheetId: sheet.id,
      saleDate,
      group,
    };
    for (const p of o.products ?? []) await linkProductToSheet(ts, p);
    return ts;
  }

  async function linkProductToSheet(sheet: TSheet, p: Id) {
    await db.order_sheet_product.create({
      data: { order_sheet_id: sheet.sheetId, product_id: p.id },
    });
  }

  /** One group, N clients (both categories, supplier distA), products linked to the sheet. */
  async function scene(
    o: {
      products?: ProductOpts[];
      clients?: number;
      clientOpts?: Omit<ClientOpts, 'group'>;
      status?: OrderPaperStatus;
      saleDate?: Date;
      group?: TGroup;
    } = {},
  ) {
    const group = o.group ?? (await addGroup());
    const products: TProduct[] = [];
    for (const po of o.products ?? [{}]) products.push(await addProduct(po));
    const clients: TClient[] = [];
    for (let i = 0; i < (o.clients ?? 1); i++) {
      clients.push(await addClient({ ...o.clientOpts, group }));
    }
    const sheet = await newSheet({
      group,
      products,
      status: o.status,
      saleDate: o.saleDate,
    });
    return { group, products, clients, sheet };
  }

  async function deleteRates(p: TProduct) {
    const linkIds = Object.values(p.links);
    await db.distributor_product_rate.deleteMany({
      where: { product_link_id: { in: linkIds } },
    });
    await db.master_client_rate_product.deleteMany({
      where: { product_link_id: { in: linkIds } },
    });
  }
  const setDistRate = (linkId: number, rate: number) =>
    db.distributor_product_rate.updateMany({
      where: { product_link_id: linkId },
      data: { selling_rate: rate },
    });

  async function addUser(role: 'ADMIN' | 'EMPLOYEE', active = true) {
    const r = await db.roles.upsert({
      where: { name: role },
      update: {},
      create: { name: role },
    });
    const k = ++seq.user;
    const u = await db.users.create({
      data: {
        role_id: r.id,
        username: `t-${sfx}-${k}`,
        email: `t-${sfx}-${k}@orders.test`,
        password: 'x',
        first_name: 'T',
        last_name: 'U',
        is_active: active,
      },
    });
    cleanups.push(() => db.users.deleteMany({ where: { id: u.id } }));
    return { id: u.id, username: u.username, role };
  }

  async function deletePapers() {
    const ids = papers.splice(0);
    if (ids.length === 0) return;
    await db.propagation_outbox.deleteMany({
      where: { paper_id: { in: ids } },
    });
    await db.order_paper.deleteMany({ where: { id: { in: ids } } });
  }

  async function cleanup() {
    await deletePapers();
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch {
        /* leftover rows from a failed test must not hide the real failure */
      }
    }
  }

  return {
    sfx,
    packName,
    milkGroup,
    nmGroup,
    distA,
    distB,
    brandPlain,
    brandTray,
    addDistributor,
    addBrand,
    addProduct,
    addGroup,
    addClient,
    addPriority,
    addDistRate,
    addClientRate,
    newSheet,
    linkProductToSheet,
    scene,
    deleteRates,
    setDistRate,
    addUser,
    deletePapers,
    cleanup,
  };
}
export type World = Awaited<ReturnType<typeof createWorld>>;

// ---------------------------------------------------------------------------
// App context
// ---------------------------------------------------------------------------
export async function createOrdersTestContext(
  opts: { throttle?: boolean; modules?: unknown[] } = {},
) {
  const world = await createWorld();

  const fakeQueue = {
    getJob: async () => undefined,
    add: async () => ({}),
    close: async () => undefined,
    on: () => undefined,
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
      PrismaModule,
      AuthModule,
      OrdersModule,
      VehicleAllocationModule,
      PurchaseModule,
      CollectionsModule,
      ...((opts.modules ?? []) as never[]),
    ],
    providers: opts.throttle
      ? [{ provide: APP_GUARD, useClass: UserThrottlerGuard }]
      : [],
  })
    .overrideProvider(PropagationOutboxRelayService)
    .useValue({})
    .overrideProvider(PropagationQueueProcessor)
    .useValue({})
    .overrideProvider(getQueueToken(PROPAGATION_QUEUE))
    .useValue(fakeQueue)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const mw = new RequestIdMiddleware();
  app.use((req: never, res: never, next: never) => mw.use(req, res, next));
  await app.init();

  const server = app.getHttpServer();
  const jwt = app.get(JwtService);
  const prisma = app.get(PrismaService);

  const users = {
    emp: await world.addUser('EMPLOYEE'),
    emp2: await world.addUser('EMPLOYEE'),
    admin: await world.addUser('ADMIN'),
  };
  const tokenFor = (
    u: { id: number; username: string; role: string },
    o?: { expiresIn?: string },
  ) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, o as never);
  const tokens = {
    emp: tokenFor(users.emp),
    emp2: tokenFor(users.emp2),
    admin: tokenFor(users.admin),
  };

  const call = (
    method: 'get' | 'post' | 'delete',
    path: string,
    token?: string | null,
    body?: unknown,
  ) => {
    let req = request(server)[method](`/api${path}`);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) req = req.send(body as object);
    return req;
  };

  const api = {
    getSheet: (sheetId: number | string, t: string | null = tokens.emp) =>
      call('get', `/orders/sheet/${sheetId}`, t),
    getItems: (sheetId: number | string, t: string | null = tokens.emp) =>
      call('get', `/orders/sheet/${sheetId}/items`, t),
    getProducts: (category: string, t: string | null = tokens.emp) =>
      call('get', `/orders/products?category=${category}`, t),
    night: (
      sheetId: number | string,
      entries: unknown[],
      expected?: string | null,
      t = tokens.emp,
    ) =>
      call('post', `/orders/sheet/${sheetId}/night-save`, t, {
        entries,
        expectedUpdatedAt: expected,
      }),
    morning: (
      sheetId: number | string,
      entries: unknown[],
      expected?: string | null,
      t = tokens.emp,
    ) =>
      call('post', `/orders/sheet/${sheetId}/morning-save`, t, {
        entries,
        expectedUpdatedAt: expected,
      }),
    addProduct: (
      sheetId: number | string,
      productId: number,
      expected?: string | null,
      t = tokens.emp,
    ) =>
      call('post', `/orders/sheet/${sheetId}/products`, t, {
        productId,
        expectedUpdatedAt: expected,
      }),
    /** expected: undefined = omit, null = literal "null", string = as given */
    removeProduct: (
      sheetId: number | string,
      productId: number,
      expected?: string | null,
      t = tokens.emp,
    ) => {
      const q =
        expected === undefined
          ? ''
          : `?expectedUpdatedAt=${expected === null ? 'null' : encodeURIComponent(expected)}`;
      return call(
        'delete',
        `/orders/sheet/${sheetId}/products/${productId}${q}`,
        t,
      );
    },
  };

  // --- DB read/seam helpers -------------------------------------------------
  const tokenOf = async (sheetId: number) =>
    (
      await db.order_sheet.findUniqueOrThrow({ where: { id: sheetId } })
    ).order_items_updated_at?.toISOString() ?? null;
  const sheetRow = (sheetId: number) =>
    db.order_sheet.findUniqueOrThrow({ where: { id: sheetId } });
  const line = (sheetId: number, clientId: number, productId: number) =>
    db.order_sheet_items.findFirst({
      where: {
        order_sheet_id: sheetId,
        client_id: clientId,
        product_id: productId,
      },
    });
  const lines = (sheetId: number) =>
    db.order_sheet_items.findMany({ where: { order_sheet_id: sheetId } });
  const trayRows = (sheetId: number) =>
    db.client_tray_transaction.findMany({ where: { order_sheet_id: sheetId } });
  const setStatus = (sheet: { paperId: number }, status: OrderPaperStatus) =>
    db.order_paper.update({ where: { id: sheet.paperId }, data: { status } });

  const seedNight = async (sheet: TSheet, entries: unknown[]) => {
    const res = await api.night(
      sheet.sheetId,
      entries,
      await tokenOf(sheet.sheetId),
    );
    // setup helper: any 2xx (200-vs-201 is tracked by S-30 / DISC-1, not here)
    expect(res.status, JSON.stringify(res.body)).toBeGreaterThanOrEqual(200);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return res.body.itemsUpdatedAt as string | null;
  };
  const seedMorning = async (sheet: TSheet, entries: unknown[]) => {
    const res = await api.morning(
      sheet.sheetId,
      entries,
      await tokenOf(sheet.sheetId),
    );
    // setup helper: any 2xx (200-vs-201 is tracked by S-30 / DISC-1, not here)
    expect(res.status, JSON.stringify(res.body)).toBeGreaterThanOrEqual(200);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return res.body.itemsUpdatedAt as string | null;
  };

  async function close() {
    await world.cleanup();
    await app.close();
  }

  return {
    app,
    world,
    db,
    prisma,
    server,
    jwt,
    users,
    tokens,
    tokenFor,
    call,
    api,
    tokenOf,
    sheetRow,
    line,
    lines,
    trayRows,
    setStatus,
    seedNight,
    seedMorning,
    close,
  };
}
export type OrdersCtx = Awaited<ReturnType<typeof createOrdersTestContext>>;
