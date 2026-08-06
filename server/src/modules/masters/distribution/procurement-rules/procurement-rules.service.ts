import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BrandsRepository } from '../../products/brands/brands.repository.js';
import { DistributorRepository } from '../distributors/distributor.repository.js';
import { ProductGroupRepository } from '../../products/product-groups/product-group.repository.js';

import { CreateProcurementRuleDto } from './dto/create-procurement-rules.dto.js';
import { UpdateProcurementRuleDto } from './dto/update-procurement-rules.dto.js';
import { ProcurementRulesRepository } from './procurement-rules.repository.js';

@Injectable()
export class ProcurementRulesService {
  constructor(
    private readonly procurementRulesRepository: ProcurementRulesRepository,
    private readonly distributorRepository: DistributorRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productGroupRepository: ProductGroupRepository,
  ) {}

  findAll() {
    return this.procurementRulesRepository.findAll();
  }

  findActive() {
    return this.procurementRulesRepository.findActive();
  }

  async findById(id: number) {
    const procurementRule = await this.procurementRulesRepository.findById(id);

    if (!procurementRule) {
      throw new NotFoundException('Procurement rule not found.');
    }

    return procurementRule;
  }

  async create(dto: CreateProcurementRuleDto) {
    await this.validateReferences(dto);

    const duplicate = await this.procurementRulesRepository.findDuplicate(
      dto.distributor_id,
      dto.category,
      dto.brand_id,
      dto.product_group_id,
    );

    if (duplicate) {
      throw new ConflictException('Procurement rule already exists.');
    }

    return this.procurementRulesRepository.create(dto);
  }

  async update(id: number, dto: UpdateProcurementRuleDto) {
    const existing = await this.findById(id);

    const data = {
      distributor_id: dto.distributor_id ?? existing.distributor_id,
      category: dto.category ?? existing.category,
      brand_id: dto.brand_id ?? existing.brand_id,
      product_group_id: dto.product_group_id ?? existing.product_group_id,
    };

    await this.validateReferences(data);

    const duplicate = await this.procurementRulesRepository.findDuplicate(
      data.distributor_id,
      data.category,
      data.brand_id,
      data.product_group_id,
    );

    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('Procurement rule already exists.');
    }

    return this.procurementRulesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.procurementRulesRepository.delete(id);
  }

  private async validateReferences(data: {
    distributor_id: number;
    brand_id: number;
    product_group_id: number;
  }) {
    const distributor = await this.distributorRepository.findById(
      data.distributor_id,
    );

    if (!distributor) {
      throw new NotFoundException('Distributor not found.');
    }

    const brand = await this.brandsRepository.findById(data.brand_id);

    if (!brand) {
      throw new NotFoundException('Brand not found.');
    }

    const productGroup = await this.productGroupRepository.findById(
      data.product_group_id,
    );

    if (!productGroup) {
      throw new NotFoundException('Product group not found.');
    }
  }
}
