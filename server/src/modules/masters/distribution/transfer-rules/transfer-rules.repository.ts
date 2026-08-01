import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateTransferRuleDto } from './dto/create-transfer-rule.dto.js';
import { UpdateTransferRuleDto } from './dto/update-transfer-rule.dto.js';

const transferRuleInclude = {
  supplier_distributor: true,
  owner_distributor: true,
} satisfies Prisma.distributor_transfer_ruleInclude;

@Injectable()
export class TransferRulesRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.distributor_transfer_rule.findMany({
      include: transferRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.distributor_transfer_rule.findMany({
      where: {
        is_active: true,
      },
      include: transferRuleInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.distributor_transfer_rule.findUnique({
      where: { id },
      include: transferRuleInclude,
    });
  }

  findDuplicate(
    supplierDistributorId: number,
    ownerDistributorId: number,
  ) {
    return this.prisma.distributor_transfer_rule.findUnique({
      where: {
        supplier_distributor_id_owner_distributor_id: {
          supplier_distributor_id: supplierDistributorId,
          owner_distributor_id: ownerDistributorId,
        },
      },
    });
  }

  create(dto: CreateTransferRuleDto) {
    return this.prisma.distributor_transfer_rule.create({
      data: dto,
      include: transferRuleInclude,
    });
  }

  update(
    id: number,
    dto: UpdateTransferRuleDto,
  ) {
    return this.prisma.distributor_transfer_rule.update({
      where: { id },
      data: dto,
      include: transferRuleInclude,
    });
  }

  delete(id: number) {
    return this.prisma.distributor_transfer_rule.delete({
      where: { id },
    });
  }
}