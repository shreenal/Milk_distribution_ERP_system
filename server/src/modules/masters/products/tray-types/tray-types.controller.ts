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
import { TrayTypesService } from './tray-types.service.js';
import { CreateTrayTypeDto } from './dto/create-tray-type.dto.js';
import { UpdateTrayTypeDto } from './dto/update-tray-type.dto.js';

@Controller('tray-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TrayTypesController {
  constructor(private readonly trayTypesService: TrayTypesService) {}

  @Get()
  findAll() {
    return this.trayTypesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.trayTypesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.trayTypesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateTrayTypeDto) {
    return this.trayTypesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrayTypeDto,
  ) {
    return this.trayTypesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.trayTypesService.delete(id);
  }
}
