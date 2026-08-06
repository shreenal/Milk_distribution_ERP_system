import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PackagingTypesRepository } from './packaging-types.repository.js';

import { CreatePackagingTypeDto } from './dto/create-packaging-type.dto.js';
import { UpdatePackagingTypeDto } from './dto/update-packaging-type.dto.js';

@Injectable()
export class PackagingTypesService {
  constructor(
    private readonly packagingTypesRepository: PackagingTypesRepository,
  ) {}

  async findAll() {
    return this.packagingTypesRepository.findAll();
  }

  async findById(id: number) {
    const packagingType = await this.packagingTypesRepository.findById(id);

    if (!packagingType) {
      throw new NotFoundException(`Packaging Type with ID ${id} not found.`);
    }

    return packagingType;
  }

  async create(dto: CreatePackagingTypeDto) {
    const existingPackagingType =
      await this.packagingTypesRepository.findByName(dto.name);

    if (existingPackagingType) {
      throw new ConflictException(
        `Packaging Type '${dto.name}' already exists.`,
      );
    }

    return this.packagingTypesRepository.create(dto);
  }

  async update(id: number, dto: UpdatePackagingTypeDto) {
    const packagingType = await this.findById(id);

    if (dto.name && dto.name !== packagingType.name) {
      const existingPackagingType =
        await this.packagingTypesRepository.findByName(dto.name);

      if (existingPackagingType) {
        throw new ConflictException(
          `Packaging Type '${dto.name}' already exists.`,
        );
      }
    }

    return this.packagingTypesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.packagingTypesRepository.delete(id);
  }
}
