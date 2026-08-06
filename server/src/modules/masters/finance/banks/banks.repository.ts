import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreateBankDto } from './dto/create-bank.dto.js';
import { UpdateBankDto } from './dto/update-bank.dto.js';

@Injectable()
export class BanksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_bank.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_bank.findUnique({
      where: { id },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_bank.findUnique({
      where: { name },
    });
  }

  async create(dto: CreateBankDto) {
    return this.prisma.master_bank.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateBankDto) {
    return this.prisma.master_bank.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_bank.delete({
      where: { id },
    });
  }

  async findActive() {
    return this.prisma.master_bank.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
