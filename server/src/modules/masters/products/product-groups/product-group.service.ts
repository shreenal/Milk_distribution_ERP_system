import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProductGroupRepository } from './product-group.repository.js';

import { CreateProductGroupDto } from './dto/create-product-group.dto.js';
import { UpdateProductGroupDto } from './dto/update-product-group.dto.js';

@Injectable()
export class ProductGroupService {
  constructor(
    private readonly productGroupRepository: ProductGroupRepository,
  ) {}

  async findAll() {
    return this.productGroupRepository.findAll();
  }

  async findById(id: number) {
    const productGroup = await this.productGroupRepository.findById(id);

    if (!productGroup) {
      throw new NotFoundException(
        `Product Group with ID ${id} not found.`,
      );
    }

    return productGroup;
  }

  async create(dto: CreateProductGroupDto) {
    const existingProductGroup =
      await this.productGroupRepository.findByName(dto.name);

    if (existingProductGroup) {
      throw new ConflictException(
        `Product Group '${dto.name}' already exists.`,
      );
    }

    return this.productGroupRepository.create(dto);
  }

  async update(
    id: number,
    dto: UpdateProductGroupDto,
  ) {
    const productGroup = await this.findById(id);

    if (
      dto.name &&
      dto.name !== productGroup.name
    ) {
      const existingProductGroup =
        await this.productGroupRepository.findByName(dto.name);

      if (existingProductGroup) {
        throw new ConflictException(
          `Product Group '${dto.name}' already exists.`,
        );
      }
    }

    return this.productGroupRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.productGroupRepository.delete(id);
  }
}