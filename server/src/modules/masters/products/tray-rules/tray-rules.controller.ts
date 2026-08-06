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

import { CreateTrayRuleDto } from './dto/create-tray-rule.dto.js';
import { UpdateTrayRuleDto } from './dto/update-tray-rule.dto.js';
import { TrayRulesService } from './tray-rules.service.js';

@Controller('tray-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TrayRulesController {
  constructor(private readonly trayRulesService: TrayRulesService) {}

  @Get()
  findAll() {
    return this.trayRulesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.trayRulesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.trayRulesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateTrayRuleDto) {
    return this.trayRulesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrayRuleDto,
  ) {
    return this.trayRulesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.trayRulesService.delete(id);
  }
}
