import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DairiesRepository } from './dairies.repository.js';

import { CreateDairyDto } from './dto/create-dairy.dto.js';
import { UpdateDairyDto } from './dto/update-dairy.dto.js';

@Injectable()
export class DairiesService {
  constructor(
    private readonly dairiesRepository: DairiesRepository,
  ) {}

  async findAll() {
    return this.dairiesRepository.findAll();
  }

  async findActive() {
    return this.dairiesRepository.findActive();
  }

  async findById(id: number) {
    const dairy = await this.dairiesRepository.findById(id);

    if (!dairy) {
      throw new NotFoundException(
        `Dairy with ID ${id} not found.`,
      );
    }

    return dairy;
  }

  async create(dto: CreateDairyDto) {
    const existingDairy = await this.dairiesRepository.findByName(dto.name);

    if (existingDairy) {
      throw new ConflictException(
        `Dairy '${dto.name}' already exists.`,
      );
    }

    return this.dairiesRepository.create(dto);
  }

  async update(id: number, dto: UpdateDairyDto) {
    await this.findById(id);

    if (dto.name) {
      const existingDairy = await this.dairiesRepository.findByName(dto.name);

      if (existingDairy && existingDairy.id !== id) {
        throw new ConflictException(
          `Dairy '${dto.name}' already exists.`,
        );
      }
    }

    return this.dairiesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.dairiesRepository.delete(id);
  }
}