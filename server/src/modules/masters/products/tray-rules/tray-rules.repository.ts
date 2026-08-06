import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateTrayRuleDto } from './dto/create-tray-rule.dto.js';
import { UpdateTrayRuleDto } from './dto/update-tray-rule.dto.js';

const trayRuleInclude = {
  master_product_group: true,
  master_brand: true,
  master_product_type: true,
  master_packaging_type: true,
  master_tray_type: true,
} satisfies Prisma.product_tray_ruleInclude;

@Injectable()
export class TrayRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.product_tray_rule.findMany({
      include: trayRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.product_tray_rule.findMany({
      where: {
        is_active: true,
      },
      include: trayRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.product_tray_rule.findUnique({
      where: { id },
      include: trayRuleInclude,
    });
  }

  findDuplicate(
    productGroupId: number | null,
    brandId: number | null,
    productTypeId: number | null,
    packagingTypeId: number | null,
    trayTypeId: number,
  ) {
    return this.prisma.product_tray_rule.findFirst({
      where: {
        product_group_id: productGroupId,
        brand_id: brandId,
        product_type_id: productTypeId,
        packaging_type_id: packagingTypeId,
        tray_type_id: trayTypeId,
      },
    });
  }
  create(dto: CreateTrayRuleDto) {
    return this.prisma.product_tray_rule.create({
      data: dto,
      include: trayRuleInclude,
    });
  }

  update(id: number, dto: UpdateTrayRuleDto) {
    return this.prisma.product_tray_rule.update({
      where: { id },
      data: dto,
      include: trayRuleInclude,
    });
  }

  delete(id: number) {
    return this.prisma.product_tray_rule.delete({
      where: { id },
    });
  }
}
