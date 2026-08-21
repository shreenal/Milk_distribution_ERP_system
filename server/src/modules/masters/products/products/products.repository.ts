import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) { }

  async findAll() {
    return this.prisma.master_product.findMany({
      include: {
        master_brand: true,
        master_product_group: true,
        master_product_type: true,
        master_packaging_type: true,
      },
      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },
        {
          master_product_group: {
            name: 'asc',
          },
        },
        {
          packaging_size: 'asc',
        },
      ],
    });
  }

  async findActive() {
    return this.prisma.master_product.findMany({
      where: {
        is_active: true,
      },
      include: {
        master_brand: true,
        master_product_group: true,
        master_product_type: true,
        master_packaging_type: true,
      },
      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },
        {
          master_product_group: {
            name: 'asc',
          },
        },
        {
          packaging_size: 'asc',
        },
      ],
    });
  }

  async findById(id: number) {
    return this.prisma.master_product.findUnique({
      where: { id },
      include: {
        master_brand: true,
        master_product_group: true,
        master_product_type: true,
        master_packaging_type: true,
      },
    });
  }

  async findDuplicate(
    brandId: number,
    productGroupId: number,
    productTypeId: number | null,
    packagingTypeId: number | null,
    packagingSize: Prisma.Decimal | number,
    packagingUnit: string,
  ) {
    return this.prisma.master_product.findFirst({
      where: {
        brand_id: brandId,
        product_group_id: productGroupId,
        product_type_id: productTypeId,
        packaging_type_id: packagingTypeId,
        packaging_size: packagingSize,
        packaging_unit: packagingUnit,
      },
    });
  }

  async create(dto: CreateProductDto & { code?: string | null }) {
    return this.prisma.master_product.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateProductDto) {
    return this.prisma.master_product.update({
      where: { id },
      data: dto,
    });
  }

  async updateCode(id: number, code: string) {
    return this.prisma.master_product.update({
      where: { id },
      data: { code },
      include: {
        master_brand: true,
        master_product_group: true,
        master_product_type: true,
        master_packaging_type: true,
      },
    });
  }

  async delete(id: number) {
    return this.prisma.master_product.delete({
      where: { id },
    });
  }

  async findConfigurationById(id: number) {
    const product = await this.prisma.master_product.findUnique({
      where: { id },
      include: {
        master_brand: true,

        master_product_group: true,

        master_product_type: true,
        master_packaging_type: true,

        product_links: {
          where: {
            is_active: true,
          },
          include: {
            distributor: true,

            distributor_rates: {
              where: {
                is_active: true,
              },
              orderBy: {
                effective_from: 'desc',
              },
            },

            client_rates: {
              where: {
                is_active: true,
              },
              include: {
                master_client: true,
              },
              orderBy: {
                effective_from: 'desc',
              },
            },
          },
        },
      },
    });

    if (!product) {
      return null;
    }

    const [trayRules, procurementRules] = await Promise.all([
      this.prisma.product_tray_rule.findMany({
        where: {
          is_active: true,

          OR: [
            {
              brand_id: null,
            },
            {
              brand_id: product.brand_id,
            },
          ],

          AND: [
            {
              OR: [
                { product_group_id: null },
                { product_group_id: product.product_group_id },
              ],
            },
            {
              OR: [
                { product_type_id: null },
                { product_type_id: product.product_type_id },
              ],
            },
            {
              OR: [
                { packaging_type_id: null },
                { packaging_type_id: product.packaging_type_id },
              ],
            },
          ],
        },

        include: {
          master_brand: true,
          master_product_group: true,
          master_product_type: true,
          master_packaging_type: true,

          master_tray_type: {
            include: {
              master_brand: true,
            },
          },
        },
      }),

      this.prisma.distributor_procurement_rule.findMany({
        where: {
          is_active: true,
          brand_id: product.brand_id,
          product_group_id: product.product_group_id,
          category: product.master_product_group.category,
        },

        include: {
          master_distributor: true,
          master_brand: true,
          master_product_group: true,
        },

        orderBy: {
          distributor_id: 'asc',
        },
      }),
    ]);

    return {
      ...product,

      procurement_rules: procurementRules,

      master_product_group: {
        ...product.master_product_group,
        product_tray_rule: trayRules,
      },
    };
  }
}
