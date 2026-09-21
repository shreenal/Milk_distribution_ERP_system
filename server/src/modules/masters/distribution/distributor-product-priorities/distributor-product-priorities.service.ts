import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProductsRepository } from '../../products/products/products.repository.js';
import { DistributorRepository } from '../distributors/distributor.repository.js';
import { GroupsRepository } from '../../clients/groups/groups.repository.js';

import { CreateDistributorProductPriorityDto } from './dto/create-distributor-product-priority.dto.js';
import { UpdateDistributorProductPriorityDto } from './dto/update-distributor-product-priority.dto.js';
import { DistributorProductPrioritiesRepository } from './distributor-product-priorities.repository.js';

@Injectable()
export class DistributorProductPrioritiesService {
  constructor(
    private readonly distributorProductPrioritiesRepository: DistributorProductPrioritiesRepository,
    private readonly groupsRepository: GroupsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly distributorRepository: DistributorRepository,
  ) {}

  findAll() {
    return this.distributorProductPrioritiesRepository.findAll();
  }

  findActive() {
    return this.distributorProductPrioritiesRepository.findActive();
  }

  async findById(id: number) {
    const priority =
      await this.distributorProductPrioritiesRepository.findById(id);

    if (!priority) {
      throw new NotFoundException('Distributor product priority not found.');
    }

    return priority;
  }

  async create(dto: CreateDistributorProductPriorityDto) {
    await this.validateReferences(dto);

    const duplicateDistributor =
      await this.distributorProductPrioritiesRepository.findDuplicateByDistributor(
        dto.group_id,
        dto.product_id,
        dto.distributor_id,
      );

    if (duplicateDistributor) {
      throw new ConflictException(
        'Distributor product priority already exists for this distributor.',
      );
    }

    const duplicatePriority =
      await this.distributorProductPrioritiesRepository.findDuplicateByPriority(
        dto.group_id,
        dto.product_id,
        dto.priority,
      );

    if (duplicatePriority) {
      throw new ConflictException(
        'Priority already exists for this group and product.',
      );
    }

    return this.distributorProductPrioritiesRepository.create(dto);
  }

  async update(id: number, dto: UpdateDistributorProductPriorityDto) {
    const existing = await this.findById(id);

    const data = {
      group_id: dto.group_id ?? existing.group_id,
      product_id: dto.product_id ?? existing.product_id,
      distributor_id: dto.distributor_id ?? existing.distributor_id,
      priority: dto.priority ?? existing.priority,
    };

    await this.validateReferences(data);

    const duplicateDistributor =
      await this.distributorProductPrioritiesRepository.findDuplicateByDistributor(
        data.group_id,
        data.product_id,
        data.distributor_id,
      );

    if (duplicateDistributor && duplicateDistributor.id !== id) {
      throw new ConflictException(
        'Distributor product priority already exists for this distributor.',
      );
    }

    const duplicatePriority =
      await this.distributorProductPrioritiesRepository.findDuplicateByPriority(
        data.group_id,
        data.product_id,
        data.priority,
      );

    if (duplicatePriority && duplicatePriority.id !== id) {
      throw new ConflictException(
        'Priority already exists for this group and product.',
      );
    }

    return this.distributorProductPrioritiesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.distributorProductPrioritiesRepository.delete(id);
  }

  private async validateReferences(data: {
    group_id: number;
    product_id: number;
    distributor_id: number;
  }) {
    const group = await this.groupsRepository.findById(data.group_id);

    if (!group) {
      throw new NotFoundException(`Group with ID ${data.group_id} not found.`);
    }

    const product = await this.productsRepository.findById(data.product_id);

    if (!product) {
      throw new NotFoundException(
        `Product with ID ${data.product_id} not found.`,
      );
    }

    const distributor = await this.distributorRepository.findById(
      data.distributor_id,
    );

    if (!distributor) {
      throw new NotFoundException(
        `Distributor with ID ${data.distributor_id} not found.`,
      );
    }
  }

  findByGroupAndProduct(groupId: number, productId: number) {
    return this.distributorProductPrioritiesRepository.findByGroupAndProduct(
      groupId,
      productId,
    );
  }
}
