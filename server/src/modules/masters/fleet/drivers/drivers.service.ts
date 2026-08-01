import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { VehiclesRepository } from '../vehicles/vehicles.repository.js';

import { CreateDriverDto } from './dto/create-driver.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { DriversRepository } from './drivers.repository.js';

@Injectable()
export class DriversService {
  constructor(
    private readonly driversRepository: DriversRepository,
    private readonly vehiclesRepository: VehiclesRepository,
  ) {}

  findAll() {
    return this.driversRepository.findAll();
  }

  findActive() {
    return this.driversRepository.findActive();
  }

  async findById(id: number) {
    const driver = await this.driversRepository.findById(id);

    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }

    return driver;
  }

  async create(dto: CreateDriverDto) {
    const existingDriver =
      await this.driversRepository.findByName(dto.name);

    if (existingDriver) {
      throw new ConflictException(
        'Driver with this name already exists.',
      );
    }

    if (dto.vehicle_id) {
      const vehicle = await this.vehiclesRepository.findById(
        dto.vehicle_id,
      );

      if (!vehicle) {
        throw new NotFoundException('Vehicle not found.');
      }
    }

    return this.driversRepository.create(dto);
  }

  async update(
    id: number,
    dto: UpdateDriverDto,
  ) {
    const driver = await this.findById(id);

    const name = dto.name ?? driver.name;
    const vehicleId =
      dto.vehicle_id !== undefined
        ? dto.vehicle_id
        : driver.vehicle_id;

    const existingDriver =
      await this.driversRepository.findByName(name);

    if (
      existingDriver &&
      existingDriver.id !== id
    ) {
      throw new ConflictException(
        'Driver with this name already exists.',
      );
    }

    if (vehicleId) {
      const vehicle = await this.vehiclesRepository.findById(
        vehicleId,
      );

      if (!vehicle) {
        throw new NotFoundException('Vehicle not found.');
      }
    }

    return this.driversRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.driversRepository.delete(id);
  }
}