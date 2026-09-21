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

import { CreateDistributorProductPriorityDto } from './dto/create-distributor-product-priority.dto.js';
import { UpdateDistributorProductPriorityDto } from './dto/update-distributor-product-priority.dto.js';
import { DistributorProductPrioritiesService } from './distributor-product-priorities.service.js';

@Controller('distributor-product-priorities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DistributorProductPrioritiesController {
  constructor(
    private readonly distributorProductPrioritiesService: DistributorProductPrioritiesService,
  ) {}

  @Get()
  findAll() {
    return this.distributorProductPrioritiesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.distributorProductPrioritiesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.distributorProductPrioritiesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateDistributorProductPriorityDto) {
    return this.distributorProductPrioritiesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDistributorProductPriorityDto,
  ) {
    return this.distributorProductPrioritiesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.distributorProductPrioritiesService.delete(id);
  }

  @Get('group/:groupId/product/:productId')
  findByGroupAndProduct(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.distributorProductPrioritiesService.findByGroupAndProduct(
      groupId,
      productId,
    );
  }
}
