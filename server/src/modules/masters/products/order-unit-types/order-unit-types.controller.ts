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

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';
import { ParseIdPipe } from '../../../../common/pipes/parse-id.pipe.js';

import { OrderUnitTypesService } from './order-unit-types.service.js';
import { CreateOrderUnitTypeDto } from './dto/create-order-unit-type.dto.js';
import { UpdateOrderUnitTypeDto } from './dto/update-order-unit-type.dto.js';

@Controller('order-unit-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class OrderUnitTypesController {
  constructor(private readonly orderUnitTypesService: OrderUnitTypesService) {}

  @Get()
  findAll() {
    return this.orderUnitTypesService.findAll();
  }

  @Get(':id')
  findById(@Param('id', ParseIdPipe) id: number) {
    return this.orderUnitTypesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateOrderUnitTypeDto) {
    return this.orderUnitTypesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateOrderUnitTypeDto,
  ) {
    return this.orderUnitTypesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIdPipe) id: number) {
    return this.orderUnitTypesService.delete(id);
  }
}
