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

import { CreateDistributorDto } from './dto/create-distributor.dto.js';
import { UpdateDistributorDto } from './dto/update-distributor.dto.js';
import { DistributorService } from './distributor.service.js';

@Controller('distributors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DistributorController {
  constructor(
    private readonly distributorService: DistributorService,
  ) {}

  @Get()
  findAll() {
    return this.distributorService.findAll();
  }

  @Get('active')
  findActive() {
    return this.distributorService.findActive();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.distributorService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateDistributorDto,
  ) {
    return this.distributorService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDistributorDto,
  ) {
    return this.distributorService.update(id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.distributorService.delete(id);
  }
}