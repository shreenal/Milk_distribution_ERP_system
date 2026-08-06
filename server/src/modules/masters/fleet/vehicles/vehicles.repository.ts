import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../prisma/prisma.service.js';

import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

@Injectable()
export class VehiclesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.master_vehicle.findMany({
      orderBy: {
        vehicle_number: 'asc',
      },
    });
  }

  findActive() {
    return this.prisma.master_vehicle.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        vehicle_number: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.master_vehicle.findUnique({
      where: {
        id,
      },
    });
  }

  findByVehicleNumber(vehicleNumber: string) {
    return this.prisma.master_vehicle.findUnique({
      where: {
        vehicle_number: vehicleNumber,
      },
    });
  }

  create(dto: CreateVehicleDto) {
    return this.prisma.master_vehicle.create({
      data: dto,
    });
  }

  update(id: number, dto: UpdateVehicleDto) {
    return this.prisma.master_vehicle.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  delete(id: number) {
    return this.prisma.master_vehicle.delete({
      where: {
        id,
      },
    });
  }
}
