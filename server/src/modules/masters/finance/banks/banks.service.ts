import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BanksRepository } from './banks.repository.js';
import { CreateBankDto } from './dto/create-bank.dto.js';
import { UpdateBankDto } from './dto/update-bank.dto.js';

@Injectable()
export class BanksService {
  constructor(private readonly banksRepository: BanksRepository) {}

  async findAll() {
    return this.banksRepository.findAll();
  }

  async findActive() {
    return this.banksRepository.findActive();
  }

  async findById(id: number) {
    const bank = await this.banksRepository.findById(id);

    if (!bank) {
      throw new NotFoundException(`Bank with ID ${id} not found.`);
    }

    return bank;
  }

  async create(dto: CreateBankDto) {
    const existingBank = await this.banksRepository.findByName(dto.name);

    if (existingBank) {
      throw new ConflictException(
        `Bank '${dto.name}' already exists.`,
      );
    }

    return this.banksRepository.create(dto);
  }

  async update(id: number, dto: UpdateBankDto) {
    await this.findById(id);

    if (dto.name) {
      const existingBank = await this.banksRepository.findByName(dto.name);

      if (existingBank && existingBank.id !== id) {
        throw new ConflictException(
          `Bank '${dto.name}' already exists.`,
        );
      }
    }

    return this.banksRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.banksRepository.delete(id);
  }
}