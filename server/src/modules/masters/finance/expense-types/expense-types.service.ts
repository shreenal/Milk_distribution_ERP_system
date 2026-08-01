import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseTypesRepository } from './expense-types.repository.js';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto.js';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto.js';

@Injectable()
export class ExpenseTypesService {
  constructor(
    private readonly expenseTypesRepository: ExpenseTypesRepository,
  ) {}

  async findAll() {
    return this.expenseTypesRepository.findAll();
  }

  async findActive() {
    return this.expenseTypesRepository.findActive();
  }

  async findById(id: number) {
    const expenseType = await this.expenseTypesRepository.findById(id);

    if (!expenseType) {
      throw new NotFoundException(
        `Expense Type with ID ${id} not found.`,
      );
    }

    return expenseType;
  }

  async create(dto: CreateExpenseTypeDto) {
    const existingExpenseType =
      await this.expenseTypesRepository.findByName(dto.name);

    if (existingExpenseType) {
      throw new ConflictException(
        `Expense Type '${dto.name}' already exists.`,
      );
    }

    return this.expenseTypesRepository.create(dto);
  }

  async update(id: number, dto: UpdateExpenseTypeDto) {
    await this.findById(id);

    if (dto.name) {
      const existingExpenseType =
        await this.expenseTypesRepository.findByName(dto.name);

      if (existingExpenseType && existingExpenseType.id !== id) {
        throw new ConflictException(
          `Expense Type '${dto.name}' already exists.`,
        );
      }
    }

    return this.expenseTypesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.expenseTypesRepository.delete(id);
  }
}