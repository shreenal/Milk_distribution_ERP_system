import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateProductGroupDto } from './dto/create-product-group.dto.js';
import { UpdateProductGroupDto } from './dto/update-product-group.dto.js';

@Injectable()
export class ProductGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_product_group.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_product_group.findUnique({
      where: { id },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_product_group.findUnique({
      where: { name },
    });
  }

  async create(dto: CreateProductGroupDto) {
    return this.prisma.master_product_group.create({
      data: dto,
    });
  }

  async update(
    id: number,
    dto: UpdateProductGroupDto,
  ) {
    return this.prisma.master_product_group.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_product_group.delete({
      where: { id },
    });
  }
}