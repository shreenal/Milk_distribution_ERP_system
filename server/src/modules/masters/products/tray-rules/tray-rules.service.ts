import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BrandsRepository } from '../brands/brands.repository.js';
import { PackagingTypesRepository } from '../packaging-types/packaging-types.repository.js';
import { ProductGroupRepository } from '../product-groups/product-group.repository.js';
import { ProductTypesRepository } from '../product-types/product-types.repository.js';
import { TrayTypesRepository } from '../tray-types/tray-types.repository.js';

import { CreateTrayRuleDto } from './dto/create-tray-rule.dto.js';
import { UpdateTrayRuleDto } from './dto/update-tray-rule.dto.js';
import { TrayRulesRepository } from './tray-rules.repository.js';

@Injectable()
export class TrayRulesService {
  constructor(
    private readonly trayRulesRepository: TrayRulesRepository,
    private readonly productGroupRepository: ProductGroupRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productTypesRepository: ProductTypesRepository,
    private readonly packagingTypesRepository: PackagingTypesRepository,
    private readonly trayTypesRepository: TrayTypesRepository,
  ) {}

  findAll() {
    return this.trayRulesRepository.findAll();
  }

  findActive() {
    return this.trayRulesRepository.findActive();
  }

  async findById(id: number) {
    const trayRule = await this.trayRulesRepository.findById(id);

    if (!trayRule) {
      throw new NotFoundException('Tray rule not found.');
    }

    return trayRule;
  }

  async create(dto: CreateTrayRuleDto) {
    await this.validateReferences(dto);

    const duplicate = await this.trayRulesRepository.findDuplicate(
      dto.product_group_id ?? null,
      dto.brand_id ?? null,
      dto.product_type_id ?? null,
      dto.packaging_type_id ?? null,
      dto.tray_type_id,
    );

    if (duplicate) {
      throw new ConflictException('Tray rule already exists.');
    }

    return this.trayRulesRepository.create(dto);
  }

  async update(id: number, dto: UpdateTrayRuleDto) {
    const existing = await this.findById(id);

    const data = {
      product_group_id: dto.product_group_id ?? existing.product_group_id,
      brand_id: dto.brand_id ?? existing.brand_id,
      product_type_id: dto.product_type_id ?? existing.product_type_id,
      packaging_type_id: dto.packaging_type_id ?? existing.packaging_type_id,
      tray_type_id: dto.tray_type_id ?? existing.tray_type_id,
    };

    await this.validateReferences(data);

    const duplicate = await this.trayRulesRepository.findDuplicate(
      data.product_group_id,
      data.brand_id,
      data.product_type_id,
      data.packaging_type_id,
      data.tray_type_id,
    );

    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('Tray rule already exists.');
    }

    return this.trayRulesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.trayRulesRepository.delete(id);
  }

  private async validateReferences(data: {
    product_group_id?: number | null;
    brand_id?: number | null;
    product_type_id?: number | null;
    packaging_type_id?: number | null;
    tray_type_id: number;
  }) {
    if (data.product_group_id != null) {
      const productGroup = await this.productGroupRepository.findById(
        data.product_group_id,
      );

      if (!productGroup) {
        throw new NotFoundException('Product group not found.');
      }
    }

    if (data.brand_id != null) {
      const brand = await this.brandsRepository.findById(data.brand_id);

      if (!brand) {
        throw new NotFoundException('Brand not found.');
      }
    }

    if (data.product_type_id != null) {
      const productType = await this.productTypesRepository.findById(
        data.product_type_id,
      );

      if (!productType) {
        throw new NotFoundException('Product type not found.');
      }
    }

    if (data.packaging_type_id != null) {
      const packagingType = await this.packagingTypesRepository.findById(
        data.packaging_type_id,
      );

      if (!packagingType) {
        throw new NotFoundException('Packaging type not found.');
      }
    }

    const trayType = await this.trayTypesRepository.findById(data.tray_type_id);

    if (!trayType) {
      throw new NotFoundException('Tray type not found.');
    }
  }
}
