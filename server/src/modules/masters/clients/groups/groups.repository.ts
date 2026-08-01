import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateGroupDto } from './dto/create-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';

const groupInclude = {
  master_vehicle: true,
} satisfies Prisma.master_groupInclude;

@Injectable()
export class GroupsRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.prisma.master_group.findMany({
      include: groupInclude,
      orderBy: {
        name: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_group.findMany({
      where: {
        is_active: true,
      },
      include: groupInclude,
      orderBy: {
        name: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_group.findUnique({
      where: { id },
      include: groupInclude,
    });
  }

  findByName(name: string) {
    return this.prisma.master_group.findUnique({
      where: { name },
    });
  }

  create(dto: CreateGroupDto) {
    return this.prisma.master_group.create({
      data: dto,
      include: groupInclude,
    });
  }

  update(id: number, dto: UpdateGroupDto) {
    return this.prisma.master_group.update({
      where: { id },
      data: dto,
      include: groupInclude,
    });
  }

  delete(id: number) {
    return this.prisma.master_group.delete({
      where: { id },
    });
  }
}