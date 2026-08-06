import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreatePackagingTypeDto } from './dto/create-packaging-type.dto.js';
import { UpdatePackagingTypeDto } from './dto/update-packaging-type.dto.js';

@Injectable()
export class PackagingTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_packaging_type.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_packaging_type.findUnique({
      where: { id },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_packaging_type.findUnique({
      where: { name },
    });
  }

  async create(dto: CreatePackagingTypeDto) {
    return this.prisma.master_packaging_type.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdatePackagingTypeDto) {
    return this.prisma.master_packaging_type.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_packaging_type.delete({
      where: { id },
    });
  }
}
