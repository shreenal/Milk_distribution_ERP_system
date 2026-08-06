import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateRolesDto } from './dto/create-roles.dto.js';
import { UpdateRolesDto } from './dto/update-roles.dto.js';
import { RolesRepository } from './roles.repository.js';

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  findAll() {
    return this.rolesRepository.findAll();
  }

  async findById(id: number) {
    const role = await this.rolesRepository.findById(id);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async create(dto: CreateRolesDto) {
    const existingRole = await this.rolesRepository.findByName(dto.name);

    if (existingRole) {
      throw new ConflictException('Role already exists');
    }

    return this.rolesRepository.create(dto);
  }

  async update(id: number, dto: UpdateRolesDto) {
    await this.findById(id);

    if (dto.name) {
      const existingRole = await this.rolesRepository.findByName(dto.name);

      if (existingRole && existingRole.id !== id) {
        throw new ConflictException('Role already exists');
      }
    }

    return this.rolesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.rolesRepository.delete(id);
  }
}
