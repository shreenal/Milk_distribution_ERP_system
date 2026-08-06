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

import { CreateProductLinksDto } from './dto/create-product-links.dto.js';
import { UpdateProductLinksDto } from './dto/update-product-links.dto.js';
import { ProductLinksService } from './product-links.service.js';

@Controller('product-links')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductLinksController {
  constructor(private readonly productLinksService: ProductLinksService) {}

  @Get()
  findAll() {
    return this.productLinksService.findAll();
  }

  @Get('active')
  findActive() {
    return this.productLinksService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.productLinksService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProductLinksDto) {
    return this.productLinksService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductLinksDto,
  ) {
    return this.productLinksService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.productLinksService.delete(id);
  }
}
