import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateRolesDto } from './dto/create-roles.dto.js';
import { UpdateRolesDto } from './dto/update-roles.dto.js';

@Injectable()
export class RolesRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.roles.findMany({
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.roles.findUnique({
      where: { id },
    });
  }

  findByName(name: string) {
    return this.prisma.roles.findUnique({
      where: { name },
    });
  }

  create(dto: CreateRolesDto) {
    return this.prisma.roles.create({
      data: dto,
    });
  }

  update(
    id: number,
    dto: UpdateRolesDto,
  ) {
    return this.prisma.roles.update({
      where: { id },
      data: dto,
    });
  }

  delete(id: number) {
    return this.prisma.roles.delete({
      where: { id },
    });
  }
}