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

import { ExpenseTypesService } from './expense-types.service.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';

import { CreateExpenseTypeDto } from './dto/create-expense-type.dto.js';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto.js';

@Controller('expense-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ExpenseTypesController {
  constructor(private readonly expenseTypesService: ExpenseTypesService) {}

  @Get()
  async findAll() {
    return this.expenseTypesService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.expenseTypesService.findActive();
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.expenseTypesService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateExpenseTypeDto) {
    return this.expenseTypesService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseTypeDto,
  ) {
    return this.expenseTypesService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.expenseTypesService.delete(id);
  }
}
