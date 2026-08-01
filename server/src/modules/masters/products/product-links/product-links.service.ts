import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DistributorRepository } from '../../distribution/distributors/distributor.repository.js';
import { ProductsRepository } from '../products/products.repository.js';

import { CreateProductLinksDto } from './dto/create-product-links.dto.js';
import { UpdateProductLinksDto } from './dto/update-product-links.dto.js';
import { ProductLinksRepository } from './product-links.repository.js';

@Injectable()
export class ProductLinksService {
  constructor(
    private readonly productLinksRepository: ProductLinksRepository,
    private readonly distributorRepository: DistributorRepository,
    private readonly productsRepository: ProductsRepository,
  ) {}

  findAll() {
    return this.productLinksRepository.findAll();
  }

  findActive() {
    return this.productLinksRepository.findActive();
  }

  async findById(id: number) {
    const productLink = await this.productLinksRepository.findById(id);

    if (!productLink) {
      throw new NotFoundException('Product link not found');
    }

    return productLink;
  }

  async create(dto: CreateProductLinksDto) {
    const distributor = await this.distributorRepository.findById(
      dto.distributor_id,
    );

    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    const product = await this.productsRepository.findById(
      dto.product_id,
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existingLink =
      await this.productLinksRepository.findDuplicate(
        dto.distributor_id,
        dto.product_id,
      );

    if (existingLink) {
      throw new ConflictException(
        'Product link already exists',
      );
    }

    return this.productLinksRepository.create(dto);
  }

  async update(
    id: number,
    dto: UpdateProductLinksDto,
  ) {
    const productLink = await this.findById(id);

    const distributorId =
      dto.distributor_id ?? productLink.distributor_id;

    const productId =
      dto.product_id ?? productLink.product_id;

    if (dto.distributor_id !== undefined) {
      const distributor =
        await this.distributorRepository.findById(
          dto.distributor_id,
        );

      if (!distributor) {
        throw new NotFoundException(
          'Distributor not found',
        );
      }
    }

    if (dto.product_id !== undefined) {
      const product = await this.productsRepository.findById(
        dto.product_id,
      );

      if (!product) {
        throw new NotFoundException('Product not found');
      }
    }

    const existingLink =
      await this.productLinksRepository.findDuplicate(
        distributorId,
        productId,
      );

    if (existingLink && existingLink.id !== id) {
      throw new ConflictException(
        'Product link already exists',
      );
    }

    return this.productLinksRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.productLinksRepository.delete(id);
  }
}