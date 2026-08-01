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

import { BanksService } from './banks.service.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';

import { CreateBankDto } from './dto/create-bank.dto.js';
import { UpdateBankDto } from './dto/update-bank.dto.js';

@Controller('banks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  async findAll() {
    return this.banksService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.banksService.findActive();
  }

  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.banksService.findById(id);
  }

  @Post()
  async create(
    @Body() dto: CreateBankDto,
  ) {
    return this.banksService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBankDto,
  ) {
    return this.banksService.update(id, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.banksService.delete(id);
  }
}