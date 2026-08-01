import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { RolesRepository } from '../roles/roles.repository.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
  ) {}

  findAll() {
    return this.usersRepository.findAll();
  }

  async findById(id: number) {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    const role = await this.rolesRepository.findById(dto.role_id);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const existingUsername = await this.usersRepository.findByUsername(
      dto.username,
    );

    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    const existingEmail = await this.usersRepository.findByEmail(
      dto.email,
    );

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.usersRepository.create({
      ...dto,
      password: hashedPassword,
    });
  }

  async update(
    id: number,
    dto: UpdateUserDto,
  ) {
    await this.findById(id);

    if (dto.role_id !== undefined) {
      const role = await this.rolesRepository.findById(
        dto.role_id,
      );

      if (!role) {
        throw new NotFoundException('Role not found');
      }
    }

    if (dto.username) {
      const existingUsername =
        await this.usersRepository.findByUsername(
          dto.username,
        );

      if (
        existingUsername &&
        existingUsername.id !== id
      ) {
        throw new ConflictException(
          'Username already exists',
        );
      }
    }

    if (dto.email) {
      const existingEmail =
        await this.usersRepository.findByEmail(
          dto.email,
        );

      if (
        existingEmail &&
        existingEmail.id !== id
      ) {
        throw new ConflictException(
          'Email already exists',
        );
      }
    }

    const updateData: UpdateUserDto = { ...dto };

    if (dto.password) {
      updateData.password = await bcrypt.hash(
        dto.password,
        10,
      );
    }

    return this.usersRepository.update(
      id,
      updateData,
    );
  }

  async delete(id: number) {
    await this.findById(id);

    return this.usersRepository.delete(id);
  }
}