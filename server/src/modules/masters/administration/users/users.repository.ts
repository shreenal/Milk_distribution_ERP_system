import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const userSelect = {
  id: true,
  username: true,
  email: true,
  first_name: true,
  last_name: true,
  created_at: true,
  updated_at: true,
  role: true,
} satisfies Prisma.usersSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.users.findMany({
      select: userSelect,
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.users.findUnique({
      where: { id },
      select: userSelect,
    });
  }

  findByIdWithPassword(id: number) {
    return this.prisma.users.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });
  }

  findByUsername(username: string) {
    return this.prisma.users.findUnique({
      where: { username },
      include: {
        role: true,
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.users.findUnique({
      where: { email },
    });
  }

  create(dto: CreateUserDto) {
    return this.prisma.users.create({
      data: dto,
      select: userSelect,
    });
  }

  update(id: number, dto: UpdateUserDto) {
    return this.prisma.users.update({
      where: { id },
      data: dto,
      select: userSelect,
    });
  }

  delete(id: number) {
    return this.prisma.users.delete({
      where: { id },
      select: userSelect,
    });
  }
}
