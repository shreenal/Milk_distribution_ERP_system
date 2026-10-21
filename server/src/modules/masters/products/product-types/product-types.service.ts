import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BrandsRepository } from '../brands/brands.repository.js';
import { ProductTypesRepository } from './product-types.repository.js';

import { CreateProductTypeDto } from './dto/create-product-type.dto.js';
import { UpdateProductTypeDto } from './dto/update-product-type.dto.js';

@Injectable()
export class ProductTypesService {
  constructor(
    private readonly productTypesRepository: ProductTypesRepository,
    private readonly brandsRepository: BrandsRepository,
  ) {}

  async findAll() {
    return this.productTypesRepository.findAll();
  }

  async findById(id: number) {
    const productType = await this.productTypesRepository.findById(id);

    if (!productType) {
      throw new NotFoundException(`Product Type with ID ${id} not found.`);
    }

    return productType;
  }

  async create(dto: CreateProductTypeDto) {
    const brand = await this.brandsRepository.findById(dto.brand_id);

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${dto.brand_id} not found.`);
    }

    const existingProductType =
      await this.productTypesRepository.findByBrandAndName(
        dto.brand_id,
        dto.name,
      );

    if (existingProductType) {
      throw new ConflictException(
        `Product Type '${dto.name}' already exists for this brand.`,
      );
    }

    return this.productTypesRepository.create(dto);
  }

  async update(id: number, dto: UpdateProductTypeDto) {
    const existing = await this.findById(id);

    if (dto.brand_id !== undefined && dto.brand_id !== existing.brand_id) {
      const brand = await this.brandsRepository.findById(dto.brand_id);
      if (!brand) {
        throw new NotFoundException(`Brand with ID ${dto.brand_id} not found.`);
      }
      if ((await this.productTypesRepository.countUsage(id)) > 0) {
        throw new ConflictException(
          'Brand cannot change while products or tray rules use this product type. Create a new product type instead.',
        );
      }
    }

    if (dto.brand_id !== undefined || dto.name !== undefined) {
      const duplicate = await this.productTypesRepository.findByBrandAndName(
        dto.brand_id ?? existing.brand_id,
        dto.name ?? existing.name,
      );
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          `Product Type '${dto.name ?? existing.name}' already exists for this brand.`,
        );
      }
    }

    return this.productTypesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);
    if ((await this.productTypesRepository.countUsage(id)) > 0) {
      throw new ConflictException(
        'Product type is in use by products or tray rules.',
      );
    }
    return this.productTypesRepository.delete(id);
  }
}
