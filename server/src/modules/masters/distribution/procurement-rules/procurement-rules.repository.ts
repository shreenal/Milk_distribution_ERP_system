import { Injectable } from '@nestjs/common';
import { Prisma, SupplyCategory } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateProcurementRuleDto } from './dto/create-procurement-rules.dto.js';
import { UpdateProcurementRuleDto } from './dto/update-procurement-rules.dto.js';

const procurementRuleInclude = {
  master_distributor: true,
  master_brand: true,
  master_product_group: true,
} satisfies Prisma.distributor_procurement_ruleInclude;

@Injectable()
export class ProcurementRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.distributor_procurement_rule.findMany({
      include: procurementRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.distributor_procurement_rule.findMany({
      where: {
        is_active: true,
      },
      include: procurementRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.distributor_procurement_rule.findUnique({
      where: { id },
      include: procurementRuleInclude,
    });
  }

  findDuplicate(
    distributorId: number,
    category: SupplyCategory,
    brandId: number,
    productGroupId: number,
  ) {
    return this.prisma.distributor_procurement_rule.findUnique({
      where: {
        distributor_id_category_brand_id_product_group_id: {
          distributor_id: distributorId,
          category,
          brand_id: brandId,
          product_group_id: productGroupId,
        },
      },
    });
  }

  create(dto: CreateProcurementRuleDto) {
    return this.prisma.distributor_procurement_rule.create({
      data: dto,
      include: procurementRuleInclude,
    });
  }

  update(id: number, dto: UpdateProcurementRuleDto) {
    return this.prisma.distributor_procurement_rule.update({
      where: { id },
      data: dto,
      include: procurementRuleInclude,
    });
  }

  delete(id: number) {
    return this.prisma.distributor_procurement_rule.delete({
      where: { id },
    });
  }
}
