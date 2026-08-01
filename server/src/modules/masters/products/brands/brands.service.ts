import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';



import { BrandsRepository } from './brands.repository.js';

import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { DairiesRepository } from '../dairies/dairies.repository.js';


@Injectable()
export class BrandsService {
  constructor(
    private readonly brandsRepository: BrandsRepository,
    private readonly dairiesRepository: DairiesRepository,
  ) {}

  async findAll() {
    return this.brandsRepository.findAll();
  }

  async findActive() {
    return this.brandsRepository.findActive();
  }

  async findById(id: number) {
    const brand = await this.brandsRepository.findById(id);

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${id} not found.`);
    }

    return brand;
  }

  async create(dto: CreateBrandDto) {
    const existingBrand = await this.brandsRepository.findByName(dto.name);

    if (existingBrand) {
      throw new ConflictException(
        `Brand '${dto.name}' already exists.`,
      );
    }

    const dairy = await this.dairiesRepository.findById(dto.dairy_id);

    if (!dairy) {
      throw new NotFoundException(
        `Dairy with ID ${dto.dairy_id} not found.`,
      );
    }

    return this.brandsRepository.create(dto);
  }

  async update(id: number, dto: UpdateBrandDto) {
    await this.findById(id);

    if (dto.name) {
      const existingBrand = await this.brandsRepository.findByName(dto.name);

      if (existingBrand && existingBrand.id !== id) {
        throw new ConflictException(
          `Brand '${dto.name}' already exists.`,
        );
      }
    }

    if (dto.dairy_id) {
      const dairy = await this.dairiesRepository.findById(dto.dairy_id);

      if (!dairy) {
        throw new NotFoundException(
          `Dairy with ID ${dto.dairy_id} not found.`,
        );
      }
    }

    return this.brandsRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.brandsRepository.delete(id);
  }
}