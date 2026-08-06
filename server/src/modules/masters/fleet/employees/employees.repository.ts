import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.master_employee.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_employee.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_employee.findUnique({
      where: {
        id,
      },
    });
  }

  findByName(name: string) {
    return this.prisma.master_employee.findUnique({
      where: {
        name,
      },
    });
  }

  create(dto: CreateEmployeeDto) {
    return this.prisma.master_employee.create({
      data: dto,
    });
  }

  update(id: number, dto: UpdateEmployeeDto) {
    return this.prisma.master_employee.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  delete(id: number) {
    return this.prisma.master_employee.delete({
      where: {
        id,
      },
    });
  }
}
