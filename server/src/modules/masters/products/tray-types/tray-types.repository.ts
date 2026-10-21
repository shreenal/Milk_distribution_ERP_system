import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateTrayTypeDto } from './dto/create-tray-type.dto.js';
import { UpdateTrayTypeDto } from './dto/update-tray-type.dto.js';

@Injectable()
export class TrayTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_tray_type.findMany({
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
          color: 'asc',
        },
      ],
    });
  }

  async findActive() {
    return this.prisma.master_tray_type.findMany({
      where: {
        is_active: true,
      },
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
          color: 'asc',
        },
      ],
    });
  }

  async findById(id: number) {
    return this.prisma.master_tray_type.findUnique({
      where: { id },
      include: {
        master_brand: true,
      },
    });
  }

  async findByBrandAndColor(brandId: number, color: string) {
    return this.prisma.master_tray_type.findFirst({
      where: {
        brand_id: brandId,
        color: { equals: color, mode: 'insensitive' },
      },
    });
  }

  async create(dto: CreateTrayTypeDto) {
    return this.prisma.master_tray_type.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateTrayTypeDto) {
    return this.prisma.master_tray_type.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_tray_type.delete({
      where: { id },
    });
  }

  async countUsage(id: number) {
    const [items, purchases] = await Promise.all([
      this.prisma.order_sheet_items.count({ where: { tray_type_id: id } }),
      this.prisma.purchase_entry.count({ where: { tray_type_id: id } }),
    ]);
    return items + purchases;
  }

  countRules(id: number) {
    return this.prisma.product_tray_rule.count({ where: { tray_type_id: id } });
  }
}
