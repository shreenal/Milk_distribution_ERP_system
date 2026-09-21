import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateOrderUnitTypeDto } from './dto/create-order-unit-type.dto.js';
import { UpdateOrderUnitTypeDto } from './dto/update-order-unit-type.dto.js';

@Injectable()
export class OrderUnitTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_order_unit_type.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_order_unit_type.findUnique({
      where: { id },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_order_unit_type.findUnique({
      where: { name },
    });
  }

  async create(dto: CreateOrderUnitTypeDto) {
    return this.prisma.master_order_unit_type.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateOrderUnitTypeDto) {
    return this.prisma.master_order_unit_type.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_order_unit_type.delete({
      where: { id },
    });
  }
}
