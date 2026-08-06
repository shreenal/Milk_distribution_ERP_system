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

import { ProductGroupService } from './product-group.service.js';
import { CreateProductGroupDto } from './dto/create-product-group.dto.js';
import { UpdateProductGroupDto } from './dto/update-product-group.dto.js';

@Controller('product-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductGroupController {
  constructor(private readonly productGroupService: ProductGroupService) {}

  @Get()
  findAll() {
    return this.productGroupService.findAll();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.productGroupService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProductGroupDto) {
    return this.productGroupService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductGroupDto,
  ) {
    return this.productGroupService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.productGroupService.delete(id);
  }
}
