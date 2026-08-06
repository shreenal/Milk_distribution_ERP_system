import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateProductLinksDto } from './dto/create-product-links.dto.js';
import { UpdateProductLinksDto } from './dto/update-product-links.dto.js';

const productLinkInclude = {
  distributor: true,
  product: true,
} satisfies Prisma.master_product_linkInclude;

@Injectable()
export class ProductLinksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.master_product_link.findMany({
      include: productLinkInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_product_link.findMany({
      where: {
        is_active: true,
      },
      include: productLinkInclude,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_product_link.findUnique({
      where: { id },
      include: productLinkInclude,
    });
  }

  findDuplicate(distributorId: number, productId: number) {
    return this.prisma.master_product_link.findUnique({
      where: {
        distributor_id_product_id: {
          distributor_id: distributorId,
          product_id: productId,
        },
      },
    });
  }

  create(dto: CreateProductLinksDto) {
    return this.prisma.master_product_link.create({
      data: dto,
      include: productLinkInclude,
    });
  }

  update(id: number, dto: UpdateProductLinksDto) {
    return this.prisma.master_product_link.update({
      where: { id },
      data: dto,
      include: productLinkInclude,
    });
  }

  delete(id: number) {
    return this.prisma.master_product_link.delete({
      where: { id },
    });
  }
}
