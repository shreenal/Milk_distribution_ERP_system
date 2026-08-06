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

import { CreateGroupSupplyRuleDto } from './dto/create-group-supply-rules.dto.js';
import { UpdateGroupSupplyRuleDto } from './dto/update-group-supply-rules.dto.js';
import { GroupSupplyRulesService } from './group-supply-rules.service.js';

@Controller('group-supply-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class GroupSupplyRulesController {
  constructor(
    private readonly groupSupplyRulesService: GroupSupplyRulesService,
  ) {}

  @Get()
  findAll() {
    return this.groupSupplyRulesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.groupSupplyRulesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.groupSupplyRulesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateGroupSupplyRuleDto) {
    return this.groupSupplyRulesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupSupplyRuleDto,
  ) {
    return this.groupSupplyRulesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.groupSupplyRulesService.delete(id);
  }
}
