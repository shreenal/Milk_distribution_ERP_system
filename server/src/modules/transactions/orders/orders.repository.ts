import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma, SupplyCategory } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { touchIfTokenMatches } from '../../../common/prisma/touch-if-unchanged.util.js';
import { DeliveredRow, UpsertRow } from '../../../types/order.types.js';
import { istDayBoundsUtc } from '../paper/paper-date.util.js';

const SQL_CHUNK = 1000; // 20 params/row => 20k params, far below the 65,535 wire limit

const isUniqueViolation = (e: any): boolean =>
  e?.code === '23505' ||
  e?.code === 'P2002' ||
  e?.meta?.code === '23505' ||
  e?.cause?.originalCode === '23505' ||
  e?.meta?.driverAdapterError?.cause?.originalCode === '23505';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSheetById(sheetId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_sheet.findUnique({
      where: {
        id: sheetId,
      },

      include: {
        master_group: true,
        order_paper: true,
      },
    });
  }

  async getClientsForSheetDisplay(
    sheetId: number,
    groupId: number,
    category: SupplyCategory,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const [eligible, historicallyReferenced] = await Promise.all([
      this.getClientsByGroupAndCategory(groupId, category, db),
      db.master_client.findMany({
        where: {
          order_sheet_items: {
            some: {
              order_sheet_id: sheetId,
              master_product: { master_product_group: { category } },
            },
          },
        },
      }),
    ]);

    const byId = new Map(eligible.map((c) => [c.id, c]));
    for (const c of historicallyReferenced) byId.set(c.id, c);
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async getClientsByGroupAndCategory(
    groupId: number,
    category: SupplyCategory,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    return prismaClient.master_client.findMany({
      where: {
        delivery_group_id: groupId,
        is_active: true,
        categories: {
          some: {
            category,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async deleteSheetItems(
    sheetId: number,
    productId: number,
    tx: PrismaOrTransaction = this.prisma,
  ) {
    return tx.order_sheet_items.deleteMany({
      where: {
        order_sheet_id: sheetId,
        product_id: productId,
      },
    });
  }

  async findAvailableProducts(
    category: SupplyCategory,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.master_product.findMany({
      where: {
        is_active: true,
        ...(category && {
          master_product_group: {
            category,
          },
        }),
      },

      include: {
        master_brand: true,
        master_product_type: true,
        master_packaging_type: true,
        master_product_group: true,
      },

      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },
        {
          packaging_size: 'asc',
        },
      ],
    });
  }

  async getProductsForSheet(
    sheetId: number,
    category: SupplyCategory,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const [eligible, historicallyReferenced] = await Promise.all([
      db.master_product.findMany({
        where: {
          is_active: true,
          master_product_group: { category },
          OR: [
            { show_by_default: true },
            { order_sheet_product: { some: { order_sheet_id: sheetId } } },
          ],
        },
        include: {
          master_brand: true,
          master_product_type: true,
          master_packaging_type: true,
          master_product_group: true,
        },
      }),
      // Anything actually billed on this sheet, even if since deactivated
      // or reclassified — a finalized paper's numbers must never change
      // because of unrelated later catalog maintenance.
      db.master_product.findMany({
        where: {
          master_product_group: { category },
          order_sheet_items: { some: { order_sheet_id: sheetId } },
        },
        include: {
          master_brand: true,
          master_product_type: true,
          master_packaging_type: true,
          master_product_group: true,
        },
      }),
    ]);

    const byId = new Map(eligible.map((p) => [p.id, p]));
    for (const p of historicallyReferenced) byId.set(p.id, p);

    return Array.from(byId.values()).sort((a, b) => {
      if ((a.display_order ?? Infinity) !== (b.display_order ?? Infinity)) {
        return (a.display_order ?? Infinity) - (b.display_order ?? Infinity);
      }
      return (
        a.master_brand.name.localeCompare(b.master_brand.name) || a.id - b.id
      );
    });
  }

  async getSheetItems(sheetId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      include: {
        master_client: { select: { id: true, code: true, name: true } },
        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_packaging_type: true,
            master_product_type: true,
          },
        },
        product_link: {
          select: {
            id: true,
            distributor_id: true,
            distributor: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async getSheetProductLink(
    sheetId: number,
    productId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_product.findUnique({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheetId,
          product_id: productId,
        },
      },
    });
  }

  async createSheetProduct(
    data: { order_sheet_id: number; product_id: number },
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_product.upsert({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: data.order_sheet_id,
          product_id: data.product_id,
        },
      },
      update: {},
      create: {
        order_sheet_id: data.order_sheet_id,
        product_id: data.product_id,
      },
    });
  }

  async deleteSheetProduct(
    sheetId: number,
    productId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_product.deleteMany({
      where: { order_sheet_id: sheetId, product_id: productId },
    });
  }

  async getMorningValidationItems(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      select: {
        id: true,
        delivered_qty: true,

        product_id: true,
        master_product: {
          select: {
            code: true,
          },
        },
      },
    });
  }

  async getQuantityValidationItems(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      select: {
        id: true,
        delivered_qty: true,

        product_id: true,
        master_product: {
          select: {
            code: true,
          },
        },
      },
    });
  }

  async getProductWithGroup(
    productId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    const product = await prismaClient.master_product.findUnique({
      where: { id: productId },
      include: {
        master_product_group: {
          select: {
            name: true,
            category: true,
          },
        },
      },
    });

    if (!product) {
      throw new BadRequestException(`Product ${productId} not found`);
    }

    return product;
  }

  async findSheetItemsByProductBatch(
    sheetId: number,
    pairs: { clientId: number; productId: number }[],
    tx: Prisma.TransactionClient,
  ) {
    const items = await tx.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheetId,
        client_id: { in: [...new Set(pairs.map((p) => p.clientId))] },
        product_id: { in: [...new Set(pairs.map((p) => p.productId))] },
      },
      include: { master_product: true, product_link: true },
    });

    const map = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      map.set(`${item.client_id}_${item.product_id}`, item);
    }
    return map;
  }

  async getProductsWithPackagingBatch(
    productIds: number[],
    db: PrismaOrTransaction,
  ) {
    const products = await db.master_product.findMany({
      where: { id: { in: productIds } },
      include: {
        master_packaging_type: true,
        product_order_unit: {
          select: {
            units_per_order_unit: true,
            pricing_quantity: true,
            pricing_unit: true,
          },
        },
      },
    });

    return new Map(products.map((p) => [p.id, p]));
  }

  async getSellingRatesBatch(
    pairs: { clientId: number; productLinkId: number }[],
    saleDate: Date,
    db: PrismaOrTransaction,
  ) {
    const clientIds = [...new Set(pairs.map((p) => p.clientId))];
    const linkIds = [...new Set(pairs.map((p) => p.productLinkId))];
    const { start: dayStart, end: dayEnd } = istDayBoundsUtc(saleDate);
    const [clientRates, distributorRates] = await Promise.all([
      db.master_client_rate_product.findMany({
        where: {
          client_id: { in: clientIds },
          product_link_id: { in: linkIds },
          is_active: true,
          effective_from: { lt: dayEnd },
          OR: [{ effective_to: null }, { effective_to: { gte: dayStart } }],
        },
        orderBy: { effective_from: 'desc' },
      }),
      db.distributor_product_rate.findMany({
        where: {
          product_link_id: { in: linkIds },
          is_active: true,
          effective_from: { lt: dayEnd },
          OR: [{ effective_to: null }, { effective_to: { gte: dayStart } }],
        },
        orderBy: { effective_from: 'desc' },
      }),
    ]);

    // most-recent-first ordering means first match per key wins
    const clientRateMap = new Map<string, Prisma.Decimal>();
    for (const r of clientRates) {
      const key = `${r.client_id}_${r.product_link_id}`;
      if (!clientRateMap.has(key)) clientRateMap.set(key, r.selling_rate);
    }

    const distributorRateMap = new Map<number, Prisma.Decimal>();
    for (const r of distributorRates) {
      if (!distributorRateMap.has(r.product_link_id)) {
        distributorRateMap.set(r.product_link_id, r.selling_rate);
      }
    }

    const resolved = new Map<string, Prisma.Decimal | null>();
    for (const { clientId, productLinkId } of pairs) {
      const key = `${clientId}_${productLinkId}`;
      resolved.set(
        key,
        clientRateMap.get(key) ?? distributorRateMap.get(productLinkId) ?? null,
      );
    }
    return resolved;
  }

  async markOrderMorningEntrySaved(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet.update({
      where: {
        id: sheetId,
      },
      data: {
        order_morning_entry_saved_at: new Date(),
      },
    });
  }

  async getProductsWithGroupBatch(
    productIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const products = await db.master_product.findMany({
      where: { id: { in: productIds } },
      include: {
        master_product_group: { select: { name: true, category: true } },
      },
    });
    return new Map(products.map((p) => [p.id, p]));
  }

  async getClientCategorySuppliersBatch(
    pairs: { clientId: number; category: SupplyCategory }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const map = new Map<string, number>();
    if (pairs.length === 0) return map;

    const rows = await db.master_client_category.findMany({
      where: {
        OR: pairs.map((p) => ({ client_id: p.clientId, category: p.category })),
      },
      select: {
        client_id: true,
        category: true,
        supplier_distributor_id: true,
      },
    });

    for (const row of rows) {
      map.set(`${row.client_id}_${row.category}`, row.supplier_distributor_id);
    }
    return map;
  }

  async getProcurementRulesBatch(
    triples: {
      brandId: number;
      category: SupplyCategory;
      productGroupId: number;
    }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const map = new Map<string, number[]>();
    if (triples.length === 0) return map;

    const rows = await db.distributor_procurement_rule.findMany({
      where: {
        is_active: true,
        master_distributor: { is_active: true },
        OR: triples.map((t) => ({
          brand_id: t.brandId,
          category: t.category,
          product_group_id: t.productGroupId,
        })),
      },
      select: {
        brand_id: true,
        category: true,
        product_group_id: true,
        distributor_id: true,
      },
    });

    for (const row of rows) {
      const key = `${row.brand_id}_${row.category}_${row.product_group_id}`;
      const list = map.get(key) ?? [];
      list.push(row.distributor_id);
      map.set(key, list);
    }
    return map;
  }

  async getProductIdsAvailableOnSheet(
    sheetId: number,
    productIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const rows = await db.master_product.findMany({
      where: {
        id: { in: productIds },
        OR: [
          { show_by_default: true },
          { order_sheet_product: { some: { order_sheet_id: sheetId } } },
          { order_sheet_items: { some: { order_sheet_id: sheetId } } },
        ],
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async getProductPrioritiesBatch(
    pairs: { groupId: number; productId: number }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const map = new Map<string, Map<number, number>>();
    if (pairs.length === 0) return map;

    const rows = await db.distributor_product_priority.findMany({
      where: {
        is_active: true,
        OR: pairs.map((p) => ({
          group_id: p.groupId,
          product_id: p.productId,
        })),
      },
      orderBy: { priority: 'asc' },
      select: {
        group_id: true,
        product_id: true,
        distributor_id: true,
        priority: true,
      },
    });

    for (const row of rows) {
      const key = `${row.group_id}_${row.product_id}`;
      const inner = map.get(key) ?? new Map<number, number>();
      if (!inner.has(row.distributor_id)) {
        inner.set(row.distributor_id, row.priority);
      }
      map.set(key, inner);
    }
    return map;
  }

  async getProductLinksForPairsBatch(
    pairs: { distributorId: number; productId: number }[],
    db: PrismaOrTransaction = this.prisma,
    activeOnly = false,
  ) {
    const map = new Map<
      string,
      { id: number; distributor_id: number; product_id: number }
    >();
    if (pairs.length === 0) return map;

    const links = await db.master_product_link.findMany({
      where: {
        OR: pairs.map((p) => ({
          distributor_id: p.distributorId,
          product_id: p.productId,
        })),
        ...(activeOnly ? { is_active: true } : {}),
      },
      select: { id: true, distributor_id: true, product_id: true },
    });

    for (const link of links) {
      map.set(`${link.distributor_id}_${link.product_id}`, link);
    }
    return map;
  }

  async upsertSheetEntriesBatch(
    rows: UpsertRow[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (let i = 0; i < rows.length; i += SQL_CHUNK) {
      await this.upsertChunk(rows.slice(i, i + SQL_CHUNK), db);
    }
  }

  private valuesTuple(r: UpsertRow) {
    return Prisma.sql`(${r.order_sheet_id}, ${r.client_id}, ${r.product_id}, ${r.product_link_id}, ${r.ordered_qty}, ${r.night_selling_rate}, ${r.night_bill_amount}, ${r.tray_type_id}, ${r.units_per_order_unit}, ${r.pricing_quantity}, ${r.pricing_unit}::"PricingUnit", ${r.delivered_qty}, ${r.final_selling_rate}, ${r.final_gst_percentage}, ${r.final_gst_amount}, ${r.final_taxable_amount}, ${r.final_bill_amount}, ${r.owner_distributor_id}, ${r.final_gst_inclusive}, ${r.resolved_via_fallback}, (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC'))`;
  }

  private async upsertChunk(rows: UpsertRow[], db: PrismaOrTransaction) {
    const values = Prisma.join(rows.map((r) => this.valuesTuple(r)));

    // Pre-update row: a line zeroed (ordered 0) and re-raised must forget its zero billing.
    const reraised = Prisma.sql`(order_sheet_items.ordered_qty = 0 AND EXCLUDED.ordered_qty > 0)`;

    try {
      await db.$executeRaw(Prisma.sql`
      INSERT INTO order_sheet_items
        (order_sheet_id, client_id, product_id, product_link_id, ordered_qty,
         night_selling_rate, night_bill_amount, tray_type_id,
         units_per_order_unit, pricing_quantity, pricing_unit,
         delivered_qty, final_selling_rate, final_gst_percentage,
         final_gst_amount, final_taxable_amount, final_bill_amount,
         owner_distributor_id, final_gst_inclusive, resolved_via_fallback,
         created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (order_sheet_id, client_id, product_link_id)
      DO UPDATE SET
        ordered_qty = EXCLUDED.ordered_qty,
        night_selling_rate = COALESCE(EXCLUDED.night_selling_rate, order_sheet_items.night_selling_rate),
        night_bill_amount = EXCLUDED.night_bill_amount,
        delivered_qty        = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.delivered_qty, order_sheet_items.delivered_qty) END,
        final_selling_rate   = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.final_selling_rate, order_sheet_items.final_selling_rate) END,
        final_gst_percentage = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.final_gst_percentage, order_sheet_items.final_gst_percentage) END,
        final_gst_amount     = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.final_gst_amount, order_sheet_items.final_gst_amount) END,
        final_taxable_amount = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.final_taxable_amount, order_sheet_items.final_taxable_amount) END,
        final_bill_amount    = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.final_bill_amount, order_sheet_items.final_bill_amount) END,
        final_gst_inclusive  = CASE WHEN ${reraised} THEN NULL ELSE COALESCE(EXCLUDED.final_gst_inclusive, order_sheet_items.final_gst_inclusive) END,
        owner_distributor_id = COALESCE(order_sheet_items.owner_distributor_id, EXCLUDED.owner_distributor_id),
        updated_at = EXCLUDED.updated_at
        -- tray_type_id, units_per_order_unit, pricing_*, resolved_via_fallback: frozen at creation
    `);
    } catch (e) {
      // Second unique key (client, product) hit with a different link: only reachable via a race.
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          'Another save changed this sheet at the same time. Please reload and retry.',
        );
      }
      throw e;
    }
  }

  async updateDeliveredEntriesBatch(
    rows: DeliveredRow[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (let i = 0; i < rows.length; i += SQL_CHUNK) {
      const chunk = rows.slice(i, i + SQL_CHUNK);
      const values = Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(${r.order_sheet_id}::int, ${r.client_id}::int, ${r.product_link_id}::int, ${r.delivered_qty}::numeric, ${r.final_selling_rate}::numeric, ${r.final_gst_percentage}::numeric, ${r.final_gst_amount}::numeric, ${r.final_taxable_amount}::numeric, ${r.final_bill_amount}::numeric, ${r.final_gst_inclusive}::boolean)`,
        ),
      );
      await db.$executeRaw(Prisma.sql`
      UPDATE order_sheet_items AS osi
      SET delivered_qty = v.delivered_qty, final_selling_rate = v.final_selling_rate,
          final_gst_percentage = v.final_gst_percentage, final_gst_amount = v.final_gst_amount,
          final_taxable_amount = v.final_taxable_amount, final_bill_amount = v.final_bill_amount,
          final_gst_inclusive = v.final_gst_inclusive, updated_at = (now() AT TIME ZONE 'UTC')
      FROM (VALUES ${values}) AS v(order_sheet_id, client_id, product_link_id, delivered_qty,
        final_selling_rate, final_gst_percentage, final_gst_amount, final_taxable_amount,
        final_bill_amount, final_gst_inclusive)
      WHERE osi.order_sheet_id = v.order_sheet_id AND osi.client_id = v.client_id
        AND osi.product_link_id = v.product_link_id
    `);
    }
  }

  async insertMorningCreatedLinesBatch(
    rows: UpsertRow[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    for (let i = 0; i < rows.length; i += SQL_CHUNK) {
      const values = Prisma.join(
        rows.slice(i, i + SQL_CHUNK).map((r) => this.valuesTuple(r)),
      );
      try {
        await db.$executeRaw(Prisma.sql`
          INSERT INTO order_sheet_items
            (order_sheet_id, client_id, product_id, product_link_id, ordered_qty,
             night_selling_rate, night_bill_amount, tray_type_id,
             units_per_order_unit, pricing_quantity, pricing_unit,
             delivered_qty, final_selling_rate, final_gst_percentage,
             final_gst_amount, final_taxable_amount, final_bill_amount,
             owner_distributor_id, final_gst_inclusive, resolved_via_fallback,
             created_at, updated_at)
          VALUES ${values}
        `);
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException(
            'Another save changed this sheet at the same time. Please reload and retry.',
          );
        }
        throw e;
      }
    }
  }

  async countPositiveOrderedItems(
    sheetId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.count({
      where: { order_sheet_id: sheetId, ordered_qty: { gt: 0 } },
    });
  }

  async getClientOwnersBatch(
    clientIds: number[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const owners = new Map<number, number>();
    if (clientIds.length === 0) return owners;

    const clients = await db.master_client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, owner_distributor_id: true },
    });

    for (const client of clients) {
      owners.set(client.id, client.owner_distributor_id);
    }
    return owners;
  }

  async touchOrderItemsIfUnchanged(
    sheetId: number,
    expectedUpdatedAt: Date | null,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfTokenMatches(
      db.order_sheet,
      { id: sheetId },
      'order_items_updated_at',
      expectedUpdatedAt,
    );
  }
}
