import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto.js';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto.js';

@Injectable()
export class ExpenseTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.master_expense_type.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findActive() {
    return this.prisma.master_expense_type.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.master_expense_type.findUnique({
      where: { id },
    });
  }

  async findByName(name: string) {
    return this.prisma.master_expense_type.findUnique({
      where: { name },
    });
  }

  async create(dto: CreateExpenseTypeDto) {
    return this.prisma.master_expense_type.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateExpenseTypeDto) {
    return this.prisma.master_expense_type.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.master_expense_type.delete({
      where: { id },
    });
  }
}