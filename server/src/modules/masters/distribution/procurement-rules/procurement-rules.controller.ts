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

import { CreateProcurementRuleDto } from './dto/create-procurement-rules.dto.js';
import { UpdateProcurementRuleDto } from './dto/update-procurement-rules.dto.js';
import { ProcurementRulesService } from './procurement-rules.service.js';

@Controller('procurement-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProcurementRulesController {
  constructor(
    private readonly procurementRulesService: ProcurementRulesService,
  ) {}

  @Get()
  findAll() {
    return this.procurementRulesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.procurementRulesService.findActive();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.procurementRulesService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateProcurementRuleDto,
  ) {
    return this.procurementRulesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProcurementRuleDto,
  ) {
    return this.procurementRulesService.update(id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.procurementRulesService.delete(id);
  }
}