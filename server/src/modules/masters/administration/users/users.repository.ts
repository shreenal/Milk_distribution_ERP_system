import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const userSelect = {
  id: true,
  role_id: true,
  username: true,
  email: true,
  first_name: true,
  last_name: true,
  created_at: true,
  updated_at: true,
  is_active: true,
  role: {
    select: {
      name: true,
    },
  },
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
    return this.prisma.users.findUnique({ where: { id }, select: userSelect });
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
      select: {
        id: true,
        username: true,
        password: true,
        is_active: true,
        role: {
          select: {
            name: true,
          },
        },
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

  update(
    id: number,
    dto: UpdateUserDto,
    options: { revokeSessions?: boolean } = {},
  ) {
    if (!options.revokeSessions) {
      return this.prisma.users.update({
        where: { id },
        data: dto,
        select: userSelect,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.users.update({
        where: { id },
        data: dto,
        select: userSelect,
      });
      await tx.refresh_token.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      return user;
    });
  }

  delete(id: number) {
    return this.prisma.users.delete({
      where: { id },
      select: userSelect,
    });
  }
}
