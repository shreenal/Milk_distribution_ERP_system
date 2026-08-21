import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

const clientInclude = {
  delivery_group: true,
  owner_distributor: true,
} satisfies Prisma.master_clientInclude;

@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.master_client.findMany({
      include: clientInclude,
      orderBy: {
        name: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_client.findMany({
      where: {
        is_active: true,
      },
      include: clientInclude,
      orderBy: {
        name: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_client.findUnique({
      where: { id },
      include: clientInclude,
    });
  }

  create(dto: CreateClientDto & { code?: string | null }) {
    return this.prisma.master_client.create({
      data: dto,
      include: clientInclude,
    });
  }

  update(id: number, dto: UpdateClientDto) {
    return this.prisma.master_client.update({
      where: { id },
      data: dto,
      include: clientInclude,
    });
  }

  updateCode(id: number, code: string) {
    return this.prisma.master_client.update({
      where: { id },
      data: { code },
      include: clientInclude,
    });
  }

  delete(id: number) {
    return this.prisma.master_client.delete({
      where: { id },
    });
  }
}
