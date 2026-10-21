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

import { ProductTypesService } from './product-types.service.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';
import { ParseIdPipe } from '../../../../common/pipes/parse-id.pipe.js';

import { CreateProductTypeDto } from './dto/create-product-type.dto.js';
import { UpdateProductTypeDto } from './dto/update-product-type.dto.js';

@Controller('product-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductTypesController {
  constructor(private readonly productTypesService: ProductTypesService) {}

  @Get()
  async findAll() {
    return this.productTypesService.findAll();
  }

  @Get(':id')
  async findById(@Param('id', ParseIdPipe) id: number) {
    return this.productTypesService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateProductTypeDto) {
    return this.productTypesService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateProductTypeDto,
  ) {
    return this.productTypesService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIdPipe) id: number) {
    return this.productTypesService.delete(id);
  }
}
