import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ClientsRepository } from '../clients/clients.repository.js';
import { ProductLinksRepository } from '../../products/product-links/product-links.repository.js';

import { ClientProductRatesRepository } from './client-product-rates.repository.js';
import { CreateClientProductRateDto } from './dto/create-client-product-rate.dto.js';
import { UpdateClientProductRateDto } from './dto/update-client-product-rate.dto.js';

@Injectable()
export class ClientProductRatesService {
  constructor(
    private readonly clientProductRatesRepository: ClientProductRatesRepository,
    private readonly clientsRepository: ClientsRepository,
    private readonly productLinksRepository: ProductLinksRepository,
  ) {}

  findAll() {
    return this.clientProductRatesRepository.findAll();
  }

  findActive() {
    return this.clientProductRatesRepository.findActive();
  }

  async findById(id: number) {
    const clientProductRate =
      await this.clientProductRatesRepository.findById(id);

    if (!clientProductRate) {
      throw new NotFoundException('Client product rate not found');
    }

    return clientProductRate;
  }

  async create(dto: CreateClientProductRateDto) {
    const client = await this.clientsRepository.findById(dto.client_id);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const productLink = await this.productLinksRepository.findById(
      dto.product_link_id,
    );

    if (!productLink) {
      throw new NotFoundException('Product link not found');
    }

    const effectiveFrom = dto.effective_from
      ? new Date(dto.effective_from)
      : new Date();

    const existingRate = await this.clientProductRatesRepository.findDuplicate(
      dto.client_id,
      dto.product_link_id,
      effectiveFrom,
    );

    if (existingRate) {
      throw new ConflictException('Client product rate already exists');
    }

    return this.clientProductRatesRepository.create(dto);
  }

  async update(id: number, dto: UpdateClientProductRateDto) {
    const clientProductRate = await this.findById(id);

    const clientId = dto.client_id ?? clientProductRate.client_id;

    const productLinkId =
      dto.product_link_id ?? clientProductRate.product_link_id;

    const effectiveFrom = dto.effective_from
      ? new Date(dto.effective_from)
      : clientProductRate.effective_from;

    if (dto.client_id !== undefined) {
      const client = await this.clientsRepository.findById(dto.client_id);

      if (!client) {
        throw new NotFoundException('Client not found');
      }
    }

    if (dto.product_link_id !== undefined) {
      const productLink = await this.productLinksRepository.findById(
        dto.product_link_id,
      );

      if (!productLink) {
        throw new NotFoundException('Product link not found');
      }
    }

    const existingRate = await this.clientProductRatesRepository.findDuplicate(
      clientId,
      productLinkId,
      effectiveFrom,
    );

    if (existingRate && existingRate.id !== id) {
      throw new ConflictException('Client product rate already exists');
    }

    return this.clientProductRatesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.clientProductRatesRepository.delete(id);
  }
}
