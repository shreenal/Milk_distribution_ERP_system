import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

@Injectable()
export class BrandsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_brand.findMany({
      include: {
        master_dairy: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findActive() {
    return this.prisma.master_brand.findMany({
      where: {
        is_active: true,
      },
      include: {
        master_dairy: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_brand.findUnique({
      where: { id },
      include: {
        master_dairy: true,
      },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_brand.findUnique({
      where: { name },
    });
  }

  async create(dto: CreateBrandDto) {
    return this.prisma.master_brand.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateBrandDto) {
    return this.prisma.master_brand.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_brand.delete({
      where: { id },
    });
  }
}