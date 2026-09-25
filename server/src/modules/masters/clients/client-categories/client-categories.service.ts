import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupplyCategory } from '../../../../generated/prisma/client.js';

import { ClientsRepository } from '../clients/clients.repository.js';

import { CreateClientCategoryDto } from './dto/create-client-category.dto.js';
import { ClientCategoriesRepository } from './client-categories.repository.js';
import { UpdateClientCategoryDto } from './dto/update-client-category.dto.js';

@Injectable()
export class ClientCategoriesService {
  constructor(
    private readonly clientCategoriesRepository: ClientCategoriesRepository,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  findAll() {
    return this.clientCategoriesRepository.findAll();
  }

  async findByClient(clientId: number) {
    const client = await this.clientsRepository.findById(clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return this.clientCategoriesRepository.findByClient(clientId);
  }

  async create(dto: CreateClientCategoryDto) {
    const client = await this.clientsRepository.findById(dto.client_id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    await this.validateSupplier(dto.supplier_distributor_id, dto.category);

    const existingCategory = await this.clientCategoriesRepository.findOne(
      dto.client_id,
      dto.category,
    );
    if (existingCategory) {
      throw new ConflictException('Client category already exists');
    }

    return this.clientCategoriesRepository.create(dto);
  }

  async update(
    clientId: number,
    category: SupplyCategory,
    dto: UpdateClientCategoryDto,
  ) {
    const existingCategory = await this.clientCategoriesRepository.findOne(
      clientId,
      category,
    );
    if (!existingCategory) {
      throw new NotFoundException('Client category not found');
    }

    await this.validateSupplier(dto.supplier_distributor_id, category);

    return this.clientCategoriesRepository.update(clientId, category, dto);
  }

  private async validateSupplier(
    supplierDistributorId: number,
    category: SupplyCategory,
  ) {
    const distributor =
      await this.clientCategoriesRepository.findDistributorById(
        supplierDistributorId,
      );

    if (!distributor || !distributor.is_active) {
      throw new BadRequestException(
        `Distributor ${supplierDistributorId} is not active or does not exist`,
      );
    }

    const hasRule =
      await this.clientCategoriesRepository.hasActiveProcurementRuleForCategory(
        supplierDistributorId,
        category,
      );

    if (!hasRule) {
      throw new BadRequestException(
        `Distributor ${supplierDistributorId} has no active procurement rule for category ${category}`,
      );
    }
  }

  async delete(clientId: number, category: SupplyCategory) {
    const existingCategory = await this.clientCategoriesRepository.findOne(
      clientId,
      category,
    );

    if (!existingCategory) {
      throw new NotFoundException('Client category not found');
    }

    return this.clientCategoriesRepository.delete(clientId, category);
  }
}
