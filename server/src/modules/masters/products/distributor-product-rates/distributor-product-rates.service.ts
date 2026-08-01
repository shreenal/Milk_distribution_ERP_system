import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProductLinksRepository } from '../product-links/product-links.repository.js';

import { CreateDistributorProductRatesDto } from './dto/create-distributor-product-rates.dto.js';
import { UpdateDistributorProductRatesDto } from './dto/update-distributor-product-rates.dto.js';
import { DistributorProductRatesRepository } from './distributor-product-rates.repository.js';

@Injectable()
export class DistributorProductRatesService {
  constructor(
    private readonly distributorProductRatesRepository: DistributorProductRatesRepository,
    private readonly productLinksRepository: ProductLinksRepository,
  ) {}

  findAll() {
    return this.distributorProductRatesRepository.findAll();
  }

  findActive() {
    return this.distributorProductRatesRepository.findActive();
  }

  async findById(id: number) {
    const distributorProductRate =
      await this.distributorProductRatesRepository.findById(id);

    if (!distributorProductRate) {
      throw new NotFoundException(
        'Distributor product rate not found',
      );
    }

    return distributorProductRate;
  }

  async create(dto: CreateDistributorProductRatesDto) {
    const productLink =
      await this.productLinksRepository.findById(
        dto.product_link_id,
      );

    if (!productLink) {
      throw new NotFoundException(
        'Product link not found',
      );
    }

    const effectiveFrom = dto.effective_from
      ? new Date(dto.effective_from)
      : new Date();

    const existingRate =
      await this.distributorProductRatesRepository.findDuplicate(
        dto.product_link_id,
        effectiveFrom,
      );

    if (existingRate) {
      throw new ConflictException(
        'Distributor product rate already exists',
      );
    }

    return this.distributorProductRatesRepository.create(dto);
  }

  async update(
    id: number,
    dto: UpdateDistributorProductRatesDto,
  ) {
    const distributorProductRate = await this.findById(id);

    const productLinkId =
      dto.product_link_id ??
      distributorProductRate.product_link_id;

    const effectiveFrom = dto.effective_from
      ? new Date(dto.effective_from)
      : distributorProductRate.effective_from;

    if (dto.product_link_id !== undefined) {
      const productLink =
        await this.productLinksRepository.findById(
          dto.product_link_id,
        );

      if (!productLink) {
        throw new NotFoundException(
          'Product link not found',
        );
      }
    }

    const existingRate =
      await this.distributorProductRatesRepository.findDuplicate(
        productLinkId,
        effectiveFrom,
      );

    if (existingRate && existingRate.id !== id) {
      throw new ConflictException(
        'Distributor product rate already exists',
      );
    }

    return this.distributorProductRatesRepository.update(
      id,
      dto,
    );
  }

  async delete(id: number) {
    await this.findById(id);

    return this.distributorProductRatesRepository.delete(id);
  }
}