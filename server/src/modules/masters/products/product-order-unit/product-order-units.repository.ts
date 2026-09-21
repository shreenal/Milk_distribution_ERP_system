import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateProductOrderUnitDto } from './dto/create-product-order-unit.dto.js';
import { UpdateProductOrderUnitDto } from './dto/update-product-order-unit.dto.js';

@Injectable()
export class ProductOrderUnitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.product_order_unit.findMany({
      include: {
        order_unit_type: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.product_order_unit.findUnique({
      where: { id },
      include: {
        order_unit_type: true,
      },
    });
  }

  async create(dto: CreateProductOrderUnitDto) {
    return this.prisma.product_order_unit.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateProductOrderUnitDto) {
    return this.prisma.product_order_unit.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.product_order_unit.delete({
      where: { id },
    });
  }
}