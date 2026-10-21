import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { BrandsService } from './brands.service.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';
import { ParseIdPipe } from '../../../../common/pipes/parse-id.pipe.js';

import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

@Controller('brands')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  async findAll() {
    return this.brandsService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.brandsService.findActive();
  }

  @Get(':id')
  async findById(@Param('id', ParseIdPipe) id: number) {
    return this.brandsService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIdPipe) id: number) {
    return this.brandsService.delete(id);
  }
}
