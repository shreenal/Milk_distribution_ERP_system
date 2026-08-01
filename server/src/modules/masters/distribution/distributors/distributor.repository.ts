import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateDistributorDto } from './dto/create-distributor.dto.js';
import { UpdateDistributorDto } from './dto/update-distributor.dto.js';

@Injectable()
export class DistributorRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.master_distributor.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_distributor.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_distributor.findUnique({
      where: {
        id,
      },
    });
  }

  findByName(name: string) {
    return this.prisma.master_distributor.findUnique({
      where: {
        name,
      },
    });
  }

  create(dto: CreateDistributorDto) {
    return this.prisma.master_distributor.create({
      data: dto,
    });
  }

  update(
    id: number,
    dto: UpdateDistributorDto,
  ) {
    return this.prisma.master_distributor.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  delete(id: number) {
    return this.prisma.master_distributor.delete({
      where: {
        id,
      },
    });
  }
}