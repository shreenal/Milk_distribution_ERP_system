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

import { CreateDriverDto } from './dto/create-driver.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { DriversService } from './drivers.service.js';

@Controller('drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
  ) {}

  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @Get('active')
  findActive() {
    return this.driversService.findActive();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.driversService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateDriverDto,
  ) {
    return this.driversService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.driversService.update(id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.driversService.delete(id);
  }
}