import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SupplyCategory,
} from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateGroupSupplyRuleDto } from './dto/create-group-supply-rules.dto.js';
import { UpdateGroupSupplyRuleDto } from './dto/update-group-supply-rules.dto.js';

const groupSupplyRuleInclude = {
  group: true,
  distributor: true,
} satisfies Prisma.master_group_supply_ruleInclude;

@Injectable()
export class GroupSupplyRulesRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.master_group_supply_rule.findMany({
      include: groupSupplyRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_group_supply_rule.findMany({
      where: {
        is_active: true,
      },
      include: groupSupplyRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_group_supply_rule.findUnique({
      where: { id },
      include: groupSupplyRuleInclude,
    });
  }

  findDuplicate(
    groupId: number,
    category: SupplyCategory,
  ) {
    return this.prisma.master_group_supply_rule.findUnique({
      where: {
        group_id_category: {
          group_id: groupId,
          category,
        },
      },
    });
  }

  create(dto: CreateGroupSupplyRuleDto) {
    return this.prisma.master_group_supply_rule.create({
      data: dto,
      include: groupSupplyRuleInclude,
    });
  }

  update(
    id: number,
    dto: UpdateGroupSupplyRuleDto,
  ) {
    return this.prisma.master_group_supply_rule.update({
      where: { id },
      data: dto,
      include: groupSupplyRuleInclude,
    });
  }

  delete(id: number) {
    return this.prisma.master_group_supply_rule.delete({
      where: { id },
    });
  }
}