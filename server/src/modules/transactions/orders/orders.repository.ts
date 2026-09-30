import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  PricingUnit,
  Prisma,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { touchIfUnchanged } from '../../../common/prisma/touch-if-unchanged.util.js';

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

  async getSheetItemsByPaperId(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
    });
  }

  async getClientsByGroupId(
    groupId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.master_client.findMany({
      where: {
        delivery_group_id: groupId,

        is_active: true,
      },

      orderBy: {
        name: 'asc',
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

  async createSheetItems(
    data: Prisma.order_sheet_itemsCreateManyInput[],
    tx: PrismaOrTransaction = this.prisma,
  ) {
    const result = await tx.order_sheet_items.createMany({
      data,
      skipDuplicates: true,
    });

    return result;
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
    category?: SupplyCategory,
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
      return a.master_brand.name.localeCompare(b.master_brand.name);
    });
  }

  async getSheetItems(sheetId: number, db: PrismaOrTransaction = this.prisma) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheetId,
      },

      include: {
        master_client: true,

        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_packaging_type: true,
            master_product_type: true,
          },
        },
        product_link: {
          include: {
            distributor: true,
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

  async findSheetItem(
    sheetId: number,
    clientId: number,
    productLinkId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    return prismaClient.order_sheet_items.findUnique({
      where: {
        order_sheet_id_client_id_product_link_id: {
          order_sheet_id: sheetId,
          client_id: clientId,
          product_link_id: productLinkId,
        },
      },
      include: {
        master_product: true,
        product_link: true,
      },
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
        ordered_qty: true,
        delivered_qty: true,

        master_product: {
          select: {
            code: true,
          },
        },
      },
    });
  }

  async upsertSheetEntry(
    data: {
      order_sheet_id: number;
      client_id: number;
      product_id: number;
      product_link_id: number;

      ordered_qty?: number;
      delivered_qty?: number;

      night_selling_rate?: number;
      night_bill_amount?: number;

      final_selling_rate?: number;
      final_gst_percentage?: number;
      final_gst_amount?: number;
      final_taxable_amount?: number;
      final_bill_amount?: number;

      tray_type_id?: number | null;

      // Required for creation; frozen after creation.
      units_per_order_unit: number;
      pricing_quantity: number;
      pricing_unit: PricingUnit;
    },
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.upsert({
      where: {
        order_sheet_id_client_id_product_link_id: {
          order_sheet_id: data.order_sheet_id,
          client_id: data.client_id,
          product_link_id: data.product_link_id,
        },
      },

      update: {
        ...(data.ordered_qty !== undefined && {
          ordered_qty: data.ordered_qty,
        }),

        ...(data.delivered_qty !== undefined && {
          delivered_qty: data.delivered_qty,
        }),

        ...(data.night_selling_rate !== undefined && {
          night_selling_rate: data.night_selling_rate,
        }),

        ...(data.night_bill_amount !== undefined && {
          night_bill_amount: data.night_bill_amount,
        }),

        ...(data.final_selling_rate !== undefined && {
          final_selling_rate: data.final_selling_rate,
        }),

        ...(data.final_gst_percentage !== undefined && {
          final_gst_percentage: data.final_gst_percentage,
        }),

        ...(data.final_gst_amount !== undefined && {
          final_gst_amount: data.final_gst_amount,
        }),

        ...(data.final_taxable_amount !== undefined && {
          final_taxable_amount: data.final_taxable_amount,
        }),

        ...(data.final_bill_amount !== undefined && {
          final_bill_amount: data.final_bill_amount,
        }),

        // Intentionally NOT updated:
        // tray_type_id
        // units_per_order_unit
        // pricing_quantity
        // pricing_unit
      },

      create: {
        order_sheet_id: data.order_sheet_id,
        client_id: data.client_id,
        product_id: data.product_id,
        product_link_id: data.product_link_id,

        ...(data.ordered_qty !== undefined && {
          ordered_qty: data.ordered_qty,
        }),

        ...(data.delivered_qty !== undefined && {
          delivered_qty: data.delivered_qty,
        }),

        ...(data.night_selling_rate !== undefined && {
          night_selling_rate: data.night_selling_rate,
        }),

        ...(data.night_bill_amount !== undefined && {
          night_bill_amount: data.night_bill_amount,
        }),

        ...(data.final_selling_rate !== undefined && {
          final_selling_rate: data.final_selling_rate,
        }),

        ...(data.final_gst_percentage !== undefined && {
          final_gst_percentage: data.final_gst_percentage,
        }),

        ...(data.final_gst_amount !== undefined && {
          final_gst_amount: data.final_gst_amount,
        }),

        ...(data.final_taxable_amount !== undefined && {
          final_taxable_amount: data.final_taxable_amount,
        }),

        ...(data.final_bill_amount !== undefined && {
          final_bill_amount: data.final_bill_amount,
        }),

        ...(data.tray_type_id !== undefined && {
          tray_type_id: data.tray_type_id,
        }),

        // Required snapshot fields.
        units_per_order_unit: data.units_per_order_unit,
        pricing_quantity: data.pricing_quantity,
        pricing_unit: data.pricing_unit,
      },
    });
  }

  async getProductCategory(
    productId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
  ): Promise<SupplyCategory> {
    const product = await prismaClient.master_product.findUnique({
      where: { id: productId },
      select: {
        master_product_group: {
          select: {
            category: true,
          },
        },
      },
    });

    if (!product) {
      throw new BadRequestException(`Product ${productId} not found`);
    }

    return product.master_product_group.category;
  }

  async getClientCategorySupplier(
    clientId: number,
    category: SupplyCategory,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.master_client_category.findUnique({
      where: {
        client_id_category: {
          client_id: clientId,
          category,
        },
      },
      select: {
        supplier_distributor_id: true,
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

  async getProductLink(
    distributorId: number,
    productId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
    activeOnly = false,
  ) {
    return prismaClient.master_product_link.findUnique({
      where: {
        distributor_id_product_id: {
          distributor_id: distributorId,
          product_id: productId,
        },
        ...(activeOnly ? { is_active: true } : {}),
      },
      select: {
        id: true,
        distributor_id: true,
        product_id: true,
      },
    });
  }

  async getSheetCommercialContext(
    sheetId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    return prismaClient.order_sheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        group_id: true,

        master_group: {
          select: {
            delivery_session: true,
          },
        },

        order_paper: {
          select: {
            sale_date: true,
          },
        },
      },
    });
  }

  async getEligibleDistributorsForProduct(
    groupId: number,
    productId: number,
    brandId: number,
    productGroupId: number,
    category: SupplyCategory,
    primaryDistributorId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    const procurementRules =
      await prismaClient.distributor_procurement_rule.findMany({
        where: {
          brand_id: brandId,
          product_group_id: productGroupId,
          category,
          is_active: true,
        },
        select: {
          distributor_id: true,
        },
      });

    const eligibleDistributorIds = procurementRules.map(
      (rule) => rule.distributor_id,
    );

    if (eligibleDistributorIds.length === 0) {
      return [];
    }

    const priorities = await prismaClient.distributor_product_priority.findMany(
      {
        where: {
          group_id: groupId,
          product_id: productId,
          distributor_id: {
            in: eligibleDistributorIds,
          },
          is_active: true,
        },
        orderBy: {
          priority: 'asc',
        },
        select: {
          distributor_id: true,
          priority: true,
        },
      },
    );

    const priorityMap = new Map(
      priorities.map((item) => [item.distributor_id, item.priority]),
    );

    return eligibleDistributorIds
      .filter(
        (distributorId) =>
          distributorId === primaryDistributorId ||
          priorityMap.has(distributorId),
      )
      .map((distributorId) => ({
        distributorId,
        priority:
          distributorId === primaryDistributorId
            ? 0
            : priorityMap.get(distributorId)!,
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  async findSheetItemByProduct(
    sheetId: number,
    clientId: number,
    productId: number,
    tx: Prisma.TransactionClient,
  ) {
    return tx.order_sheet_items.findFirst({
      where: {
        order_sheet_id: sheetId,
        client_id: clientId,
        product_id: productId,
      },
      include: {
        master_product: { include: { master_packaging_type: true } },
        product_link: true,
      },
    });
  }

  async getProductWithPackaging(
    productId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    const product = await db.master_product.findUnique({
      where: { id: productId },
      include: { master_packaging_type: true },
    });
    if (!product)
      throw new BadRequestException(`Product ${productId} not found`);
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
        OR: pairs.map((p) => ({
          client_id: p.clientId,
          product_id: p.productId,
        })),
      },
      include: {
        master_product: { include: { master_packaging_type: true } },
        product_link: true,
      },
    });

    const map = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      map.set(`${item.client_id}_${item.product_id}`, item);
    }
    return map;
  }

  async getSheetProductLinksBatch(
    sheetId: number,
    productIds: number[],
    tx: Prisma.TransactionClient,
  ) {
    const links = await tx.order_sheet_product.findMany({
      where: { order_sheet_id: sheetId, product_id: { in: productIds } },
    });
    return new Map(links.map((l) => [l.product_id, l]));
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
    effectiveDate: Date,
    db: PrismaOrTransaction,
  ) {
    const clientIds = [...new Set(pairs.map((p) => p.clientId))];
    const linkIds = [...new Set(pairs.map((p) => p.productLinkId))];

    const [clientRates, distributorRates] = await Promise.all([
      db.master_client_rate_product.findMany({
        where: {
          client_id: { in: clientIds },
          product_link_id: { in: linkIds },
          is_active: true,
          effective_from: { lte: effectiveDate },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveDate } },
          ],
        },
        orderBy: { effective_from: 'desc' },
      }),
      db.distributor_product_rate.findMany({
        where: {
          product_link_id: { in: linkIds },
          is_active: true,
          effective_from: { lte: effectiveDate },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveDate } },
          ],
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

  async getProductLinksBatch(
    distributorIds: number[],
    productId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
    activeOnly = false,
  ) {
    const links = await prismaClient.master_product_link.findMany({
      where: {
        product_id: productId,
        distributor_id: { in: distributorIds },
        ...(activeOnly ? { is_active: true } : {}),
      },
      select: { id: true, distributor_id: true, product_id: true },
    });
    return new Map(links.map((l) => [l.distributor_id, l]));
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
    rows: {
      order_sheet_id: number;
      client_id: number;
      product_id: number;
      product_link_id: number;
      ordered_qty: number;
      night_selling_rate: number | null;
      night_bill_amount: number;
      tray_type_id: number | null;
      units_per_order_unit: number;
      pricing_quantity: number;
      pricing_unit: PricingUnit;
      delivered_qty: number | null;
      final_selling_rate: number | null;
      final_gst_percentage: number | null;
      final_gst_amount: number | null;
      final_taxable_amount: number | null;
      final_bill_amount: number | null;
    }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (rows.length === 0) return;

    const values = Prisma.join(
      rows.map(
        (r) =>
          Prisma.sql`(${r.order_sheet_id}, ${r.client_id}, ${r.product_id}, ${r.product_link_id}, ${r.ordered_qty}, ${r.night_selling_rate}, ${r.night_bill_amount}, ${r.tray_type_id}, ${r.units_per_order_unit}, ${r.pricing_quantity}, ${r.pricing_unit}::"PricingUnit", ${r.delivered_qty}, ${r.final_selling_rate}, ${r.final_gst_percentage}, ${r.final_gst_amount}, ${r.final_taxable_amount}, ${r.final_bill_amount}, now(), now())`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
      INSERT INTO order_sheet_items
        (order_sheet_id, client_id, product_id, product_link_id, ordered_qty,
         night_selling_rate, night_bill_amount, tray_type_id,
         units_per_order_unit, pricing_quantity, pricing_unit,
         delivered_qty, final_selling_rate, final_gst_percentage,
         final_gst_amount, final_taxable_amount, final_bill_amount,
         created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (order_sheet_id, client_id, product_link_id)
      DO UPDATE SET
        ordered_qty = EXCLUDED.ordered_qty,
        night_selling_rate = COALESCE(EXCLUDED.night_selling_rate, order_sheet_items.night_selling_rate),
        night_bill_amount = EXCLUDED.night_bill_amount,
        delivered_qty = COALESCE(EXCLUDED.delivered_qty, order_sheet_items.delivered_qty),
        final_selling_rate = COALESCE(EXCLUDED.final_selling_rate, order_sheet_items.final_selling_rate),
        final_gst_percentage = COALESCE(EXCLUDED.final_gst_percentage, order_sheet_items.final_gst_percentage),
        final_gst_amount = COALESCE(EXCLUDED.final_gst_amount, order_sheet_items.final_gst_amount),
        final_taxable_amount = COALESCE(EXCLUDED.final_taxable_amount, order_sheet_items.final_taxable_amount),
        final_bill_amount = COALESCE(EXCLUDED.final_bill_amount, order_sheet_items.final_bill_amount),
        updated_at = EXCLUDED.updated_at
        -- tray_type_id, units_per_order_unit, pricing_quantity, pricing_unit
        -- intentionally NOT updated: frozen after creation (unchanged rule).
    `);
  }

  /**
   * H9: batched replacement for the per-entry `tx.order_sheet_items.update`
   * loop in saveMorningEntriesBatch. Every row here is known to already
   * exist (callers only include entries with a resolved existingItem), so
   * this is a plain set-based UPDATE, not an upsert.
   */
  async updateDeliveredEntriesBatch(
    rows: {
      order_sheet_id: number;
      client_id: number;
      product_link_id: number;
      delivered_qty: number;
      final_selling_rate: number;
      final_gst_percentage: number;
      final_gst_amount: number;
      final_taxable_amount: number;
      final_bill_amount: number;
    }[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    if (rows.length === 0) return;

    const values = Prisma.join(
      rows.map(
        (r) =>
          Prisma.sql`(${r.order_sheet_id}, ${r.client_id}, ${r.product_link_id}, ${r.delivered_qty}, ${r.final_selling_rate}, ${r.final_gst_percentage}, ${r.final_gst_amount}, ${r.final_taxable_amount}, ${r.final_bill_amount})`,
      ),
    );

    await db.$executeRaw(Prisma.sql`
      UPDATE order_sheet_items AS osi
      SET
        delivered_qty = v.delivered_qty,
        final_selling_rate = v.final_selling_rate,
        final_gst_percentage = v.final_gst_percentage,
        final_gst_amount = v.final_gst_amount,
        final_taxable_amount = v.final_taxable_amount,
        final_bill_amount = v.final_bill_amount,
        updated_at = now()
      FROM (VALUES ${values}) AS v(
        order_sheet_id, client_id, product_link_id, delivered_qty,
        final_selling_rate, final_gst_percentage, final_gst_amount,
        final_taxable_amount, final_bill_amount
      )
      WHERE osi.order_sheet_id = v.order_sheet_id
        AND osi.client_id = v.client_id
        AND osi.product_link_id = v.product_link_id
    `);
  }

  async touchOrderItemsIfUnchanged(
    sheetId: number,
    expectedUpdatedAt: Date | null,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return touchIfUnchanged(
      db.order_sheet,
      { id: sheetId },
      'order_items_updated_at',
      expectedUpdatedAt,
    );
  }
}
