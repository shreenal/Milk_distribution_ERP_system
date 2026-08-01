import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

 
}