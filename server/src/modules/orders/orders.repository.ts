import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    });
  }

  async findSheetItem(sheetId: number, clientId: number, productId: number) {
    return this.prisma.order_sheet_items.findUnique({
      where: {
        order_sheet_id_client_id_product_id: {
          order_sheet_id: sheetId,

          client_id: clientId,

          product_id: productId,
        },
      },

      include: {
        master_product: true,
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
        order_sheet_id_client_id_product_id: {
          order_sheet_id: data.order_sheet_id,

          client_id: data.client_id,

          product_id: data.product_id,
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
        order_sheet_id_client_id_product_id: {
          order_sheet_id: data.order_sheet_id,

          client_id: data.client_id,

          product_id: data.product_id,
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
    productId: number,
    effectiveDate: Date, // ← CRITICAL: Use sale date, not current date
  ) {
    const clientRate = await this.prisma.master_client_rate_product.findFirst({
      where: {
        client_id: clientId,
        product_id: productId,
        is_active: true,

        effective_from: {
          lte: effectiveDate,
        },

        OR: [
          {
            effective_to: null,
          },
          {
            effective_to: {
              gte: effectiveDate,
            },
          },
        ],
      },

      // Get most recent applicable rate
      orderBy: {
        effective_from: 'desc',
      },
    });

    if (clientRate) {
      return clientRate.selling_rate;
    }

    const client = await this.prisma.master_client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        distributor_id: true,
      },
    });

    if (!client) {
      throw new BadRequestException(`Client ${clientId} not found`);
    }

    const distributorRate =
      await this.prisma.distributor_product_rate.findFirst({
        where: {
          distributor_id: client.distributor_id,

          product_id: productId,

          is_active: true,

          effective_from: {
            lte: effectiveDate,
          },

          OR: [
            {
              effective_to: null,
            },
            {
              effective_to: {
                gte: effectiveDate,
              },
            },
          ],
        },

        orderBy: {
          effective_from: 'desc',
        },
      });
    if (!distributorRate) {
      throw new BadRequestException(
        `No active distributor rate found for ${client.distributor_id} and ${productId} on ${effectiveDate.toISOString()}`,
      );
    }

    return distributorRate.selling_rate;
  }
}
