import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PRODUCT_CODE_LENGTH,
  PRODUCT_CODE_PREFIX,
  ProductConfigurationStatus,
} from './products.constants.js';

import { ProductsRepository } from './products.repository.js';
import { BrandsRepository } from '../brands/brands.repository.js';
import { ProductGroupRepository } from '../product-groups/product-group.repository.js';
import { ProductTypesRepository } from '../product-types/product-types.repository.js';
import { PackagingTypesRepository } from '../packaging-types/packaging-types.repository.js';
import type { ProductConfigurationStatusDetail } from '../../../../types/product.types.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productGroupRepository: ProductGroupRepository,
    private readonly productTypesRepository: ProductTypesRepository,
    private readonly packagingTypesRepository: PackagingTypesRepository,
  ) { }

  async findAll() {
    return this.productsRepository.findAll();
  }

  async findActive() {
    return this.productsRepository.findActive();
  }

  async findById(id: number) {
    const product = await this.productsRepository.findById(id);

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    return product;
  }

  async create(dto: CreateProductDto) {
    const brand = await this.brandsRepository.findById(dto.brand_id);

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${dto.brand_id} not found.`);
    }

    const productGroup = await this.productGroupRepository.findById(
      dto.product_group_id,
    );

    if (!productGroup) {
      throw new NotFoundException(
        `Product Group with ID ${dto.product_group_id} not found.`,
      );
    }

    if (dto.product_type_id) {
      const productType = await this.productTypesRepository.findById(
        dto.product_type_id,
      );

      if (!productType) {
        throw new NotFoundException(
          `Product Type with ID ${dto.product_type_id} not found.`,
        );
      }
    }

    if (dto.packaging_type_id) {
      const packagingType = await this.packagingTypesRepository.findById(
        dto.packaging_type_id,
      );

      if (!packagingType) {
        throw new NotFoundException(
          `Packaging Type with ID ${dto.packaging_type_id} not found.`,
        );
      }
    }

    const duplicate = await this.productsRepository.findDuplicate(
      dto.brand_id,
      dto.product_group_id,
      dto.product_type_id ?? null,
      dto.packaging_type_id ?? null,
      dto.packaging_size,
      dto.packaging_unit,
    );

    if (duplicate) {
      throw new ConflictException(
        'A product with the same configuration already exists.',
      );
    }

    const product = await this.productsRepository.create({
      ...dto,
      code: null,
    });

    const code = this.generateProductCode(product.id);

    return this.productsRepository.updateCode(product.id, code);
  }

  async update(id: number, dto: UpdateProductDto) {
    const existingProduct = await this.findById(id);

    const brandId = dto.brand_id ?? existingProduct.brand_id;

    const productGroupId =
      dto.product_group_id ?? existingProduct.product_group_id;

    const productTypeId =
      dto.product_type_id !== undefined
        ? dto.product_type_id
        : existingProduct.product_type_id;

    const packagingTypeId =
      dto.packaging_type_id !== undefined
        ? dto.packaging_type_id
        : existingProduct.packaging_type_id;

    const packagingSize = dto.packaging_size ?? existingProduct.packaging_size;

    const packagingUnit = dto.packaging_unit ?? existingProduct.packaging_unit;

    const brand = await this.brandsRepository.findById(brandId);

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${brandId} not found.`);
    }

    const productGroup =
      await this.productGroupRepository.findById(productGroupId);

    if (!productGroup) {
      throw new NotFoundException(
        `Product Group with ID ${productGroupId} not found.`,
      );
    }

    if (productTypeId) {
      const productType =
        await this.productTypesRepository.findById(productTypeId);

      if (!productType) {
        throw new NotFoundException(
          `Product Type with ID ${productTypeId} not found.`,
        );
      }
    }

    if (packagingTypeId) {
      const packagingType =
        await this.packagingTypesRepository.findById(packagingTypeId);

      if (!packagingType) {
        throw new NotFoundException(
          `Packaging Type with ID ${packagingTypeId} not found.`,
        );
      }
    }

    const duplicate = await this.productsRepository.findDuplicate(
      brandId,
      productGroupId,
      productTypeId ?? null,
      packagingTypeId ?? null,
      packagingSize,
      packagingUnit,
    );

    if (duplicate && duplicate.id !== id) {
      throw new ConflictException(
        'A product with the same configuration already exists.',
      );
    }

    return this.productsRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.productsRepository.delete(id);
  }

  async findConfigurationById(id: number) {
    const configuration =
      await this.productsRepository.findConfigurationById(id);

    if (!configuration) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    const activeProductLinks = configuration.product_links.filter(
      (link) => link.is_active,
    );

    const missingDistributorRates = activeProductLinks.filter(
      (link) =>
        !link.distributor_rates.some((rate) => rate.is_active),
    ).length;

    const distributorConfigured = activeProductLinks.length > 0;

    const distributorRatesConfigured =
      distributorConfigured && missingDistributorRates === 0;

    const clientRatesConfigured = activeProductLinks.some((link) =>
      link.client_rates.some((rate) => rate.is_active),
    );

    const issues: string[] = [];

    let status: ProductConfigurationStatus;

    if (!distributorConfigured) {
      status = ProductConfigurationStatus.UNCONFIGURED;

      issues.push(
        'No active distributor is configured for this product.',
      );
    } else if (!distributorRatesConfigured) {
      status = ProductConfigurationStatus.PARTIAL;

      issues.push(
        `${missingDistributorRates} active distributor link(s) have no active distributor rate.`,
      );
    } else {
      status = ProductConfigurationStatus.READY;
    }

    if (!clientRatesConfigured) {
      issues.push(
        'No active client product rate is configured.',
      );
    }

    const configurationStatus: ProductConfigurationStatusDetail = {
      status,
      distributorConfigured,
      distributorRatesConfigured,
      clientRatesConfigured,
      activeDistributorCount: activeProductLinks.length,
      missingDistributorRates,
      missingClientRates: 0,
      issues,
    };

    return {
      ...configuration,
      configurationStatus,
    };
  }

  private generateProductCode(id: number): string {
    return `${PRODUCT_CODE_PREFIX}${id
      .toString()
      .padStart(PRODUCT_CODE_LENGTH, '0')}`;
  }
}
