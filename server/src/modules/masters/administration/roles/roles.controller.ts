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

import { CreateRolesDto } from './dto/create-roles.dto.js';
import { UpdateRolesDto } from './dto/update-roles.dto.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateRolesDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRolesDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.delete(id);
  }
}
