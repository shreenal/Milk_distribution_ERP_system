import { Injectable } from '@nestjs/common';
import { Prisma ,SupplyCategory} from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateClientCategoryDto } from './dto/create-client-category.dto.js';

const clientCategoryInclude = {
  master_client: true,
} satisfies Prisma.master_client_categoryInclude;

@Injectable()
export class ClientCategoriesRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.master_client_category.findMany({
      include: clientCategoryInclude,
      orderBy: {
        client_id: 'asc',
      },
    });
  }

  findByClient(clientId: number) {
    return this.prisma.master_client_category.findMany({
      where: {
        client_id: clientId,
      },
      include: clientCategoryInclude,
      orderBy: {
        category: 'asc',
      },
    });
  }

  findOne(clientId: number, category: SupplyCategory) {
    return this.prisma.master_client_category.findUnique({
      where: {
        client_id_category: {
          client_id: clientId,
          category,
        },
      },
      include: clientCategoryInclude,
    });
  }

  create(dto: CreateClientCategoryDto) {
    return this.prisma.master_client_category.create({
      data: dto,
      include: clientCategoryInclude,
    });
  }

  delete(clientId: number, category: SupplyCategory) {
    return this.prisma.master_client_category.delete({
      where: {
        client_id_category: {
          client_id: clientId,
          category,
        },
      },
    });
  }
}