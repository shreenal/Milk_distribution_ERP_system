import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateDistributorDto } from './dto/create-distributor.dto.js';
import { UpdateDistributorDto } from './dto/update-distributor.dto.js';
import { DistributorRepository } from './distributor.repository.js';

@Injectable()
export class DistributorService {
  constructor(private readonly distributorRepository: DistributorRepository) {}

  findAll() {
    return this.distributorRepository.findAll();
  }

  findActive() {
    return this.distributorRepository.findActive();
  }

  async findById(id: number) {
    const distributor = await this.distributorRepository.findById(id);

    if (!distributor) {
      throw new NotFoundException('Distributor not found.');
    }

    return distributor;
  }

  async create(dto: CreateDistributorDto) {
    const existingDistributor = await this.distributorRepository.findByName(
      dto.name,
    );

    if (existingDistributor) {
      throw new ConflictException('Distributor with this name already exists.');
    }

    return this.distributorRepository.create(dto);
  }

  async update(id: number, dto: UpdateDistributorDto) {
    const distributor = await this.findById(id);

    const name = dto.name ?? distributor.name;

    const existingDistributor =
      await this.distributorRepository.findByName(name);

    if (existingDistributor && existingDistributor.id !== id) {
      throw new ConflictException('Distributor with this name already exists.');
    }

    return this.distributorRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.distributorRepository.delete(id);
  }
}
