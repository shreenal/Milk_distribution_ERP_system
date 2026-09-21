import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateDistributorProductPriorityDto } from './dto/create-distributor-product-priority.dto.js';
import { UpdateDistributorProductPriorityDto } from './dto/update-distributor-product-priority.dto.js';

const distributorProductPriorityInclude = {
  group: true,
  product: true,
  distributor: true,
} satisfies Prisma.distributor_product_priorityInclude;

@Injectable()
export class DistributorProductPrioritiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.distributor_product_priority.findMany({
      include: distributorProductPriorityInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.distributor_product_priority.findMany({
      where: {
        is_active: true,
      },
      include: distributorProductPriorityInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.distributor_product_priority.findUnique({
      where: { id },
      include: distributorProductPriorityInclude,
    });
  }

  findDuplicateByDistributor(
    groupId: number,
    productId: number,
    distributorId: number,
  ) {
    return this.prisma.distributor_product_priority.findUnique({
      where: {
        group_id_product_id_distributor_id: {
          group_id: groupId,
          product_id: productId,
          distributor_id: distributorId,
        },
      },
    });
  }

  findDuplicateByPriority(
    groupId: number,
    productId: number,
    priority: number,
  ) {
    return this.prisma.distributor_product_priority.findUnique({
      where: {
        group_id_product_id_priority: {
          group_id: groupId,
          product_id: productId,
          priority,
        },
      },
    });
  }

  create(dto: CreateDistributorProductPriorityDto) {
    return this.prisma.distributor_product_priority.create({
      data: dto,
      include: distributorProductPriorityInclude,
    });
  }

  update(id: number, dto: UpdateDistributorProductPriorityDto) {
    return this.prisma.distributor_product_priority.update({
      where: { id },
      data: dto,
      include: distributorProductPriorityInclude,
    });
  }

  delete(id: number) {
    return this.prisma.distributor_product_priority.delete({
      where: { id },
    });
  }

  findByGroupAndProduct(groupId: number, productId: number) {
    return this.prisma.distributor_product_priority.findMany({
      where: {
        group_id: groupId,
        product_id: productId,
        is_active: true,
      },
      include: {
        group: true,
        product: true,
        distributor: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });
  }
}
