import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreateDairyDto } from './dto/create-dairy.dto.js';
import { UpdateDairyDto } from './dto/update-dairy.dto.js';

@Injectable()
export class DairiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_dairy.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findActive() {
    return this.prisma.master_dairy.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_dairy.findUnique({
      where: { id },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_dairy.findUnique({
      where: { name },
    });
  }

  async create(dto: CreateDairyDto) {
    return this.prisma.master_dairy.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateDairyDto) {
    return this.prisma.master_dairy.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_dairy.delete({
      where: { id },
    });
  }
}
