import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { OrderUnitTypesRepository } from './order-unit-types.repository.js';
import { CreateOrderUnitTypeDto } from './dto/create-order-unit-type.dto.js';
import { UpdateOrderUnitTypeDto } from './dto/update-order-unit-type.dto.js';

@Injectable()
export class OrderUnitTypesService {
  constructor(
    private readonly orderUnitTypesRepository: OrderUnitTypesRepository,
  ) {}

  async findAll() {
    return this.orderUnitTypesRepository.findAll();
  }

  async findById(id: number) {
    const orderUnitType = await this.orderUnitTypesRepository.findById(id);

    if (!orderUnitType) {
      throw new NotFoundException(
        `Order Unit Type with ID ${id} not found.`,
      );
    }

    return orderUnitType;
  }

  async create(dto: CreateOrderUnitTypeDto) {
    const existing = await this.orderUnitTypesRepository.findByName(
      dto.name,
    );

    if (existing) {
      throw new ConflictException(
        'An order unit type with the same name already exists.',
      );
    }

    return this.orderUnitTypesRepository.create(dto);
  }

  async update(id: number, dto: UpdateOrderUnitTypeDto) {
    await this.findById(id);

    if (dto.name !== undefined) {
      const existing = await this.orderUnitTypesRepository.findByName(
        dto.name,
      );

      if (existing && existing.id !== id) {
        throw new ConflictException(
          'An order unit type with the same name already exists.',
        );
      }
    }

    return this.orderUnitTypesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.orderUnitTypesRepository.delete(id);
  }
}
