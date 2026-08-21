import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateDistributorProductRatesDto } from './dto/create-distributor-product-rates.dto.js';

import { UpdateDistributorProductRatesDto } from './dto/update-distributor-product-rates.dto.js';

const distributorProductRateInclude = {
  product_link: true,
} satisfies Prisma.distributor_product_rateInclude;

@Injectable()
export class DistributorProductRatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.distributor_product_rate.findMany({
      include: distributorProductRateInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.distributor_product_rate.findMany({
      where: {
        is_active: true,
      },
      include: distributorProductRateInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.distributor_product_rate.findUnique({
      where: { id },
      include: distributorProductRateInclude,
    });
  }

  findDuplicate(productLinkId: number, effectiveFrom: Date) {
    return this.prisma.distributor_product_rate.findUnique({
      where: {
        product_link_id_effective_from: {
          product_link_id: productLinkId,
          effective_from: effectiveFrom,
        },
      },
    });
  }

  create(dto: CreateDistributorProductRatesDto) {
    return this.prisma.distributor_product_rate.create({
      data: {
        product_link_id: dto.product_link_id,
        purchase_rate: dto.purchase_rate,
        selling_rate: dto.selling_rate,

        ...(dto.effective_from !== undefined && {
          effective_from: new Date(
            `${dto.effective_from}T00:00:00.000Z`,
          ),
        }),

        ...(dto.effective_to !== undefined && {
          effective_to: dto.effective_to
            ? new Date(
                `${dto.effective_to}T00:00:00.000Z`,
              )
            : null,
        }),

        ...(dto.is_active !== undefined && {
          is_active: dto.is_active,
        }),
      },
      include: distributorProductRateInclude,
    });
  }

  update(id: number, dto: UpdateDistributorProductRatesDto) {
    return this.prisma.distributor_product_rate.update({
      where: { id },
      data: {
        ...(dto.product_link_id !== undefined && {
          product_link_id: dto.product_link_id,
        }),

        ...(dto.purchase_rate !== undefined && {
          purchase_rate: dto.purchase_rate,
        }),

        ...(dto.selling_rate !== undefined && {
          selling_rate: dto.selling_rate,
        }),

        ...(dto.effective_from !== undefined && {
          effective_from: new Date(
            `${dto.effective_from}T00:00:00.000Z`,
          ),
        }),

        ...(dto.effective_to !== undefined && {
          effective_to: dto.effective_to
            ? new Date(
                `${dto.effective_to}T00:00:00.000Z`,
              )
            : null,
        }),

        ...(dto.is_active !== undefined && {
          is_active: dto.is_active,
        }),
      },
      include: distributorProductRateInclude,
    });
  }

  delete(id: number) {
    return this.prisma.distributor_product_rate.delete({
      where: { id },
    });
  }
}