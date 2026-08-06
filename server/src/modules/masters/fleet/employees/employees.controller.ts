import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';

import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { EmployeesService } from './employees.service.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.employeesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.delete(id);
  }
}
