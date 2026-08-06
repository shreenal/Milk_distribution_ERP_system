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
import { PackagingTypesService } from './packaging-types.service.js';
import { CreatePackagingTypeDto } from './dto/create-packaging-type.dto.js';
import { UpdatePackagingTypeDto } from './dto/update-packaging-type.dto.js';

@Controller('packaging-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PackagingTypesController {
  constructor(private readonly packagingTypesService: PackagingTypesService) {}

  @Get()
  findAll() {
    return this.packagingTypesService.findAll();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.packagingTypesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreatePackagingTypeDto) {
    return this.packagingTypesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePackagingTypeDto,
  ) {
    return this.packagingTypesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.packagingTypesService.delete(id);
  }
}
