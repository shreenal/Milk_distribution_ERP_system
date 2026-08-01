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

import { DairiesService } from './dairies.service.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';

import { CreateDairyDto } from './dto/create-dairy.dto.js';
import { UpdateDairyDto } from './dto/update-dairy.dto.js';

@Controller('dairies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DairiesController {
  constructor(
    private readonly dairiesService: DairiesService,
  ) {}

  @Get()
  async findAll() {
    return this.dairiesService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.dairiesService.findActive();
  }

  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dairiesService.findById(id);
  }

  @Post()
  async create(
    @Body() dto: CreateDairyDto,
  ) {
    return this.dairiesService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDairyDto,
  ) {
    return this.dairiesService.update(id, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dairiesService.delete(id);
  }
}