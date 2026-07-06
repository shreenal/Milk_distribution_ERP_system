import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma, SupplyCategory } from '../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../types/transaction.types.js';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) { }

  async getActiveGroups() {
    return this.prisma.master_group.findMany({
      where: {
        is_active: true,
      },
    });
  }

  async generateOrderSheets(paperId: number, groups: { id: number }[]) {
    return this.prisma.order_sheet.createMany({
      data: groups.map((group) => ({
        order_paper_id: paperId,

        group_id: group.id,
      })),
      skipDuplicates: true,
    });
  }

  async findSheetById(sheetId: number) {
    return this.prisma.order_sheet.findUnique({
      where: {
        id: sheetId,
      },

      include: {
        master_group: true,

        order_paper: true,
      },
    });
  }

  async getSheetItemsByPaperId(paperId: number) {
    return this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
    });
  }

  async getClientsByGroupId(groupId: number) {
    return this.prisma.master_client.findMany({
      where: {
        delivery_group_id: groupId,

        is_active: true,
      },

      orderBy: {
        name: 'asc',
      },
    });
  }

  async getClientsByGroupAndCategory(
    groupId: number,
    category: SupplyCategory,
  ) {
    return this.prisma.master_client.findMany({
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

  async getProductsByGroup(groupName: string) {
    const data = await this.prisma.master_product.findMany({
      where: {
        is_active: true,

        master_product_group: {
          name: groupName,
        },
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

    return data;
  }

  async getProductsByCategory(category: SupplyCategory) {
    return this.prisma.master_product.findMany({
      where: {
        is_active: true,
        master_product_group: {
          category,
        },
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

  async getSheetItems(sheetId: number) {
    return this.prisma.order_sheet_items.findMany({
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

  async getMorningValidationItems(sheetId: number) {
    return this.prisma.order_sheet_items.findMany({
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

  async getQuantityValidationItems(sheetId: number) {
    return this.prisma.order_sheet_items.findMany({
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

  async upsertSheetEntry(data: {
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
  }) {
    return this.prisma.order_sheet_items.upsert({
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
      },

      create: {
        order_sheet_id: data.order_sheet_id,

        client_id: data.client_id,

        product_id: data.product_id,

        product_link_id: data.product_link_id,

        ordered_qty: data.ordered_qty ?? 0,

        delivered_qty: data.delivered_qty ?? 0,

        night_selling_rate: data.night_selling_rate ?? 0,

        night_bill_amount: data.night_bill_amount ?? 0,

        final_selling_rate: data.final_selling_rate ?? 0,

        final_gst_percentage: data.final_gst_percentage ?? 0,

        final_gst_amount: data.final_gst_amount ?? 0,

        final_taxable_amount: data.final_taxable_amount ?? 0,

        final_bill_amount: data.final_bill_amount ?? 0,
      },
    });
  }

  async upsertSheetEntryTx(
    tx: Prisma.TransactionClient,
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
    },
  ) {
    return tx.order_sheet_items.upsert({
      where: {
        order_sheet_id_client_id_product_link_id: {
          order_sheet_id: data.order_sheet_id,
          client_id: data.client_id,
          product_link_id: data.product_link_id,
        },
      },

      update: {
        ordered_qty: data.ordered_qty,

        night_selling_rate: Number(data.night_selling_rate),

        night_bill_amount: Number(data.night_bill_amount?.toFixed(2)),
      },

      create: {
        order_sheet_id: data.order_sheet_id,

        client_id: data.client_id,

        product_id: data.product_id,

        product_link_id: data.product_link_id,

        ordered_qty: data.ordered_qty,

        night_selling_rate: Number(data.night_selling_rate),

        night_bill_amount: Number(data.night_bill_amount?.toFixed(2)),

        delivered_qty: null,

        final_selling_rate: 0,

        final_gst_percentage: 0,

        final_gst_amount: 0,

        final_taxable_amount: 0,

        final_bill_amount: 0,
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

  async getGroupSupplyRules(groupId: number) {
    const rules = await this.prisma.master_group_supply_rule.findMany({
      where: {
        group_id: groupId,
        is_active: true,
      },
      select: {
        category: true,
        distributor_id: true,
      },
    });

    const milkRule = rules.find((r) => r.category === SupplyCategory.MILK);

    const nonMilkRule = rules.find(
      (r) => r.category === SupplyCategory.NON_MILK,
    );

    return {
      milkDistributorId: milkRule?.distributor_id ?? null,
      nonMilkDistributorId: nonMilkRule?.distributor_id ?? null,
    };
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

  /**
   * CRITICAL FIX: Get applicable selling rate as of a specific effective date
   *
   * This prevents the corruption that occurs when reopening historical orders.
   *
   * @param clientId - The client ID
   * @param productId - The product ID
   * @param effectiveDate - The date to use for rate lookup (typically sale_date)
   *                        NOT the current date
   *
   * @returns The applicable selling rate for the given date
   *
   * @example
   * // Correct: Use order date from paper
   * const rate = await this.getNightApplicableRate(
   *   clientId,
   *   productId,
   *   orderPaper.sale_date  // ← Correct
   * );
   *
   * // Wrong (old code): Used current date
   * const rate = await this.getNightApplicableRate(
   *   clientId,
   *   productId,
   *   new Date()  // ← WRONG - would corrupt historical orders
   * );
   *
   * Scenario:
   * - Order created on 2024-01-15 with rate ₹65/L
   * - Rate changed to ₹75/L on 2024-02-01
   * - Order reopened on 2024-03-15
   *
   * Old behavior: Would load ₹75 → WRONG, accounting corruption
   * New behavior: Looks up rate as of 2024-01-15 → ₹65 ✓ Correct
   */
  async getSellingRate(
    clientId: number,
    productLinkId: number,
    effectiveDate: Date,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    const clientRate = await prismaClient.master_client_rate_product.findFirst({
      where: {
        client_id: clientId,
        product_link_id: productLinkId,
        is_active: true,
        effective_from: { lte: effectiveDate },
        OR: [{ effective_to: null }, { effective_to: { gte: effectiveDate } }],
      },
      orderBy: {
        effective_from: 'desc',
      },
    });

    // Get most recent applicable rate

    if (clientRate) {
      return clientRate.selling_rate;
    }

    const distributorRate =
      await prismaClient.distributor_product_rate.findFirst({
        where: {
          product_link_id: productLinkId,
          is_active: true,
          effective_from: { lte: effectiveDate },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveDate } },
          ],
        },
        orderBy: {
          effective_from: 'desc',
        },
      });
    if (!distributorRate) {
      throw new BadRequestException(
        `No active distributor rate found for product link ${productLinkId} on ${effectiveDate.toISOString()}`,
      );
    }

    return distributorRate.selling_rate;
  }

  async getSellingRateForDistributor(
    clientId: number,
    productId: number,
    distributorId: number,
    effectiveDate: Date,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    const productLink = await this.getProductLink(
      distributorId,
      productId,
      prismaClient,
    );

    if (!productLink) {
      throw new BadRequestException(
        `No product link found for distributor ${distributorId} and product ${productId}`,
      );
    }

    return this.getSellingRate(
      clientId,
      productLink.id,
      effectiveDate,
      prismaClient,
    );
  }

  async getOrderItemsWithSupplyContextByPaperId(paperId: number) {
    const items = await this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      include: {
        order_sheet: {
          include: {
            master_group: true,
          },
        },
        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },
      },
    });

    const groupIds = [
      ...new Set(items.map((item) => item.order_sheet.group_id)),
    ];

    const rules = await this.prisma.master_group_supply_rule.findMany({
      where: {
        group_id: { in: groupIds },
        is_active: true,
      },
    });

    const rulesMap = new Map<string, number>();

    for (const rule of rules) {
      rulesMap.set(`${rule.group_id}_${rule.category}`, rule.distributor_id);
    }

    return items.map((item) => {
      const category = item.master_product.master_product_group.category;

      const distributorId = rulesMap.get(
        `${item.order_sheet.group_id}_${category}`,
      );

      if (!distributorId) {
        throw new BadRequestException(
          `Supply rule missing for group ${item.order_sheet.group_id} category ${category}`,
        );
      }

      return {
        sheetId: item.order_sheet_id,
        groupId: item.order_sheet.group_id,
        groupName: item.order_sheet.master_group.name,

        clientId: item.client_id,

        distributorId,
        category,

        productId: item.product_id,
        orderedQty: Number(item.ordered_qty ?? 0),

        brandId: item.master_product.master_brand.id,
        brandName: item.master_product.master_brand.name,

        productGroupId: item.master_product.master_product_group.id,
        productGroupName: item.master_product.master_product_group.name,

        productTypeId: item.master_product.master_product_type?.id ?? null,
        productTypeName: item.master_product.master_product_type?.name ?? null,

        packagingTypeId: item.master_product.master_packaging_type?.id ?? null,
        packagingTypeName:
          item.master_product.master_packaging_type?.name ?? null,
      };
    });
  }

  async getProductLink(
    distributorId: number,
    productId: number,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    return prismaClient.master_product_link.findUnique({
      where: {
        distributor_id_product_id: {
          distributor_id: distributorId,
          product_id: productId,
        },
      },
      select: {
        id: true,
        distributor_id: true,
        product_id: true,
      },
    });
  }

  async canDistributorProcureProduct(
    distributorId: number,
    brandId: number,
    productGroupId: number,
    category: SupplyCategory,
    prismaClient: PrismaOrTransaction = this.prisma,
  ) {
    return prismaClient.distributor_procurement_rule.findFirst({
      where: {
        distributor_id: distributorId,
        brand_id: brandId,
        product_group_id: productGroupId,
        category,
        is_active: true,
      },
      select: {
        id: true,
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
        order_paper: {
          select: {
            sale_date: true,
          },
        },
      },
    });
  }
}
