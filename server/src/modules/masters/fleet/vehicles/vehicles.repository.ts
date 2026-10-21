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

  /** Case-insensitive: 'MH04AB1234' and 'mh04ab1234' are the same vehicle. */
  findByVehicleNumber(vehicleNumber: string) {
    return this.prisma.master_vehicle.findFirst({
      where: { vehicle_number: { equals: vehicleNumber, mode: 'insensitive' } },
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

  async countAssignments(id: number) {
    const [groups, drivers] = await Promise.all([
      this.prisma.master_group.count({ where: { vehicle_id: id } }),
      this.prisma.master_driver.count({ where: { vehicle_id: id } }),
    ]);
    return groups + drivers;
  }
}
