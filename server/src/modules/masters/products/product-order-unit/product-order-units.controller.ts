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

import { ProductOrderUnitsService } from './product-order-units.service.js';

import { CreateProductOrderUnitDto } from './dto/create-product-order-unit.dto.js';
import { UpdateProductOrderUnitDto } from './dto/update-product-order-unit.dto.js';

@Controller('product-order-units')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductOrderUnitsController {
  constructor(
    private readonly productOrderUnitsService: ProductOrderUnitsService,
  ) {}

  @Get()
  findAll() {
    return this.productOrderUnitsService.findAll();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.productOrderUnitsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProductOrderUnitDto) {
    return this.productOrderUnitsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductOrderUnitDto,
  ) {
    return this.productOrderUnitsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.productOrderUnitsService.delete(id);
  }
}
