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

import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehiclesService } from './vehicles.service.js';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
  ) {}

  @Get()
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.vehiclesService.findActive();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.vehiclesService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.vehiclesService.delete(id);
  }
}