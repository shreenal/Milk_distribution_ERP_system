import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';
import { ParseIdPipe } from '../../../../common/pipes/parse-id.pipe.js';

import { CreateGroupDto } from './dto/create-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  findAll() {
    return this.groupsService.findAll();
  }

  @Get('active')
  findActive() {
    return this.groupsService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIdPipe) id: number) {
    return this.groupsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groupsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIdPipe) id: number) {
    return this.groupsService.delete(id);
  }
}