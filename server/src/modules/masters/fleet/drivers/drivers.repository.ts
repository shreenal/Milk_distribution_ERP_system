import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateDriverDto } from './dto/create-driver.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';

@Injectable()
export class DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.master_driver.findMany({
      include: {
        master_vehicle: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_driver.findMany({
      where: {
        is_active: true,
      },
      include: {
        master_vehicle: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_driver.findUnique({
      where: {
        id,
      },
      include: {
        master_vehicle: true,
      },
    });
  }

  findByName(name: string) {
    return this.prisma.master_driver.findUnique({
      where: {
        name,
      },
    });
  }

  create(dto: CreateDriverDto) {
    return this.prisma.master_driver.create({
      data: dto,
      include: {
        master_vehicle: true,
      },
    });
  }

  update(id: number, dto: UpdateDriverDto) {
    return this.prisma.master_driver.update({
      where: {
        id,
      },
      data: dto,
      include: {
        master_vehicle: true,
      },
    });
  }

  delete(id: number) {
    return this.prisma.master_driver.delete({
      where: {
        id,
      },
    });
  }
}
