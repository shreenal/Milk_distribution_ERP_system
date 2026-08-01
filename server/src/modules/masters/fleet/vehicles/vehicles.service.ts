import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehiclesRepository } from './vehicles.repository.js';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly vehiclesRepository: VehiclesRepository,
  ) {}

  findAll() {
    return this.vehiclesRepository.findAll();
  }

  findActive() {
    return this.vehiclesRepository.findActive();
  }

  async findById(id: number) {
    const vehicle = await this.vehiclesRepository.findById(id);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }

    return vehicle;
  }

  async create(dto: CreateVehicleDto) {
    const existingVehicle =
      await this.vehiclesRepository.findByVehicleNumber(
        dto.vehicle_number,
      );

    if (existingVehicle) {
      throw new ConflictException(
        'Vehicle with this number already exists.',
      );
    }

    return this.vehiclesRepository.create(dto);
  }

  async update(
    id: number,
    dto: UpdateVehicleDto,
  ) {
    const vehicle = await this.findById(id);

    const vehicleNumber =
      dto.vehicle_number ?? vehicle.vehicle_number;

    const existingVehicle =
      await this.vehiclesRepository.findByVehicleNumber(
        vehicleNumber,
      );

    if (
      existingVehicle &&
      existingVehicle.id !== id
    ) {
      throw new ConflictException(
        'Vehicle with this number already exists.',
      );
    }

    return this.vehiclesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.vehiclesRepository.delete(id);
  }
}