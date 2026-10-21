import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreateProductTypeDto } from './dto/create-product-type.dto.js';
import { UpdateProductTypeDto } from './dto/update-product-type.dto.js';

@Injectable()
export class ProductTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_product_type.findMany({
      include: {
        master_brand: true,
      },
      orderBy: [
        {
          master_brand: {
            name: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async findById(id: number) {
    return this.prisma.master_product_type.findUnique({
      where: { id },
      include: {
        master_brand: true,
      },
    });
  }

  async findByBrandAndName(brandId: number, name: string) {
    return this.prisma.master_product_type.findFirst({
      where: {
        brand_id: brandId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
  }

  async create(dto: CreateProductTypeDto) {
    return this.prisma.master_product_type.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateProductTypeDto) {
    return this.prisma.master_product_type.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_product_type.delete({
      where: { id },
    });
  }

  async countUsage(id: number) {
    const [rules, products] = await Promise.all([
      this.prisma.product_tray_rule.count({ where: { product_type_id: id } }),
      this.prisma.master_product.count({ where: { product_type_id: id } }),
    ]);
    return rules + products;
  }
}
