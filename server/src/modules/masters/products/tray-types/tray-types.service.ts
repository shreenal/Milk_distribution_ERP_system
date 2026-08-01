import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BrandsRepository } from '../brands/brands.repository.js';
import { TrayTypesRepository } from './tray-types.repository.js';

import { CreateTrayTypeDto } from './dto/create-tray-type.dto.js';
import { UpdateTrayTypeDto } from './dto/update-tray-type.dto.js';

@Injectable()
export class TrayTypesService {
  constructor(
    private readonly trayTypesRepository: TrayTypesRepository,
    private readonly brandsRepository: BrandsRepository,
  ) {}

  async findAll() {
    return this.trayTypesRepository.findAll();
  }

  async findActive() {
    return this.trayTypesRepository.findActive();
  }

  async findById(id: number) {
    const trayType = await this.trayTypesRepository.findById(id);

    if (!trayType) {
      throw new NotFoundException(
        `Tray Type with ID ${id} not found.`,
      );
    }

    return trayType;
  }

  async create(dto: CreateTrayTypeDto) {
    const brand = await this.brandsRepository.findById(dto.brand_id);

    if (!brand) {
      throw new NotFoundException(
        `Brand with ID ${dto.brand_id} not found.`,
      );
    }

    const existingTrayType =
      await this.trayTypesRepository.findByBrandAndColor(
        dto.brand_id,
        dto.color,
      );

    if (existingTrayType) {
      throw new ConflictException(
        `Tray Type with color '${dto.color}' already exists for this brand.`,
      );
    }

    return this.trayTypesRepository.create(dto);
  }

  async update(
    id: number,
    dto: UpdateTrayTypeDto,
  ) {
    await this.findById(id);

    if (dto.brand_id) {
      const brand = await this.brandsRepository.findById(dto.brand_id);

      if (!brand) {
        throw new NotFoundException(
          `Brand with ID ${dto.brand_id} not found.`,
        );
      }
    }

    if (dto.brand_id && dto.color) {
      const existingTrayType =
        await this.trayTypesRepository.findByBrandAndColor(
          dto.brand_id,
          dto.color,
        );

      if (existingTrayType && existingTrayType.id !== id) {
        throw new ConflictException(
          `Tray Type with color '${dto.color}' already exists for this brand.`,
        );
      }
    }

    return this.trayTypesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.trayTypesRepository.delete(id);
  }
}