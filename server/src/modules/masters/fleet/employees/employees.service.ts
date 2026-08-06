import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { EmployeesRepository } from './employees.repository.js';

@Injectable()
export class EmployeesService {
  constructor(private readonly employeesRepository: EmployeesRepository) {}

  findAll() {
    return this.employeesRepository.findAll();
  }

  findActive() {
    return this.employeesRepository.findActive();
  }

  async findById(id: number) {
    const employee = await this.employeesRepository.findById(id);

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    const existingEmployee = await this.employeesRepository.findByName(
      dto.name,
    );

    if (existingEmployee) {
      throw new ConflictException('Employee with this name already exists.');
    }

    return this.employeesRepository.create(dto);
  }

  async update(id: number, dto: UpdateEmployeeDto) {
    const employee = await this.findById(id);

    const name = dto.name ?? employee.name;

    const existingEmployee = await this.employeesRepository.findByName(name);

    if (existingEmployee && existingEmployee.id !== id) {
      throw new ConflictException('Employee with this name already exists.');
    }

    return this.employeesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.employeesRepository.delete(id);
  }
}
