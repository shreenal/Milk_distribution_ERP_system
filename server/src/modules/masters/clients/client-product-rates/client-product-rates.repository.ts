import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateClientProductRateDto } from './dto/create-client-product-rate.dto.js';
import { UpdateClientProductRateDto } from './dto/update-client-product-rate.dto.js';

const clientProductRateInclude = {
  master_client: true,
  product_link: true,
} satisfies Prisma.master_client_rate_productInclude;

@Injectable()
export class ClientProductRatesRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.master_client_rate_product.findMany({
      include: clientProductRateInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_client_rate_product.findMany({
      where: {
        is_active: true,
      },
      include: clientProductRateInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_client_rate_product.findUnique({
      where: { id },
      include: clientProductRateInclude,
    });
  }

  findDuplicate(
    clientId: number,
    productLinkId: number,
    effectiveFrom: Date,
  ) {
    return this.prisma.master_client_rate_product.findUnique({
      where: {
        client_id_product_link_id_effective_from: {
          client_id: clientId,
          product_link_id: productLinkId,
          effective_from: effectiveFrom,
        },
      },
    });
  }

  create(dto: CreateClientProductRateDto) {
    return this.prisma.master_client_rate_product.create({
      data: dto,
      include: clientProductRateInclude,
    });
  }

  update(
    id: number,
    dto: UpdateClientProductRateDto,
  ) {
    return this.prisma.master_client_rate_product.update({
      where: { id },
      data: dto,
      include: clientProductRateInclude,
    });
  }

  delete(id: number) {
    return this.prisma.master_client_rate_product.delete({
      where: { id },
    });
  }
}