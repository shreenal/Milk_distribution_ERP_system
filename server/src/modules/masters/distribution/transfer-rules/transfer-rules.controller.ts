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

import { CreateTransferRuleDto } from './dto/create-transfer-rule.dto.js';
import { UpdateTransferRuleDto } from './dto/update-transfer-rule.dto.js';
import { TransferRulesService } from './transfer-rules.service.js';

@Controller('transfer-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TransferRulesController {
  constructor(
    private readonly transferRulesService: TransferRulesService,
  ) {}

  @Get()
  findAll() {
    return this.transferRulesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.transferRulesService.findActive();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transferRulesService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateTransferRuleDto,
  ) {
    return this.transferRulesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransferRuleDto,
  ) {
    return this.transferRulesService.update(id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transferRulesService.delete(id);
  }
}