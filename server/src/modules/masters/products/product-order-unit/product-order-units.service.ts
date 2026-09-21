import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProductOrderUnitsRepository } from './product-order-units.repository.js';
import { OrderUnitTypesRepository } from '../order-unit-types/order-unit-types.repository.js';

import { CreateProductOrderUnitDto } from './dto/create-product-order-unit.dto.js';
import { UpdateProductOrderUnitDto } from './dto/update-product-order-unit.dto.js';

@Injectable()
export class ProductOrderUnitsService {
  constructor(
    private readonly productOrderUnitsRepository: ProductOrderUnitsRepository,
    private readonly orderUnitTypesRepository: OrderUnitTypesRepository,
  ) {}

  async findAll() {
    return this.productOrderUnitsRepository.findAll();
  }

  async findById(id: number) {
    const productOrderUnit =
      await this.productOrderUnitsRepository.findById(id);

    if (!productOrderUnit) {
      throw new NotFoundException(
        `Product Order Unit with ID ${id} not found.`,
      );
    }

    return productOrderUnit;
  }

  async create(dto: CreateProductOrderUnitDto) {
    const orderUnitType = await this.orderUnitTypesRepository.findById(
      dto.order_unit_type_id,
    );

    if (!orderUnitType) {
      throw new NotFoundException(
        `Order Unit Type with ID ${dto.order_unit_type_id} not found.`,
      );
    }

    return this.productOrderUnitsRepository.create(dto);
  }

  async update(id: number, dto: UpdateProductOrderUnitDto) {
    await this.findById(id);

    if (dto.order_unit_type_id !== undefined) {
      const orderUnitType = await this.orderUnitTypesRepository.findById(
        dto.order_unit_type_id,
      );

      if (!orderUnitType) {
        throw new NotFoundException(
          `Order Unit Type with ID ${dto.order_unit_type_id} not found.`,
        );
      }
    }

    return this.productOrderUnitsRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.productOrderUnitsRepository.delete(id);
  }
}