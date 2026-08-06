import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { VehiclesRepository } from '../../fleet/vehicles/vehicles.repository.js';

import { CreateGroupDto } from './dto/create-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsRepository } from './groups.repository.js';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupsRepository: GroupsRepository,
    private readonly vehiclesRepository: VehiclesRepository,
  ) {}

  findAll() {
    return this.groupsRepository.findAll();
  }

  findActive() {
    return this.groupsRepository.findActive();
  }

  async findById(id: number) {
    const group = await this.groupsRepository.findById(id);

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async create(dto: CreateGroupDto) {
    const existingGroup = await this.groupsRepository.findByName(dto.name);

    if (existingGroup) {
      throw new ConflictException('Group name already exists');
    }

    if (dto.vehicle_id) {
      const vehicle = await this.vehiclesRepository.findById(dto.vehicle_id);

      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }
    }

    return this.groupsRepository.create(dto);
  }

  async update(id: number, dto: UpdateGroupDto) {
    const group = await this.findById(id);

    const name = dto.name ?? group.name;

    const existingGroup = await this.groupsRepository.findByName(name);

    if (existingGroup && existingGroup.id !== id) {
      throw new ConflictException('Group name already exists');
    }

    if (dto.vehicle_id !== undefined) {
      if (dto.vehicle_id !== null) {
        const vehicle = await this.vehiclesRepository.findById(dto.vehicle_id);

        if (!vehicle) {
          throw new NotFoundException('Vehicle not found');
        }
      }
    }

    return this.groupsRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.groupsRepository.delete(id);
  }
}
