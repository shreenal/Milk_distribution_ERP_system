import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupplyCategory } from '../../../../generated/prisma/client.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';
import { ParseIdPipe } from '../../../../common/pipes/parse-id.pipe.js';

import { ClientCategoriesService } from './client-categories.service.js';
import { CreateClientCategoryDto } from './dto/create-client-category.dto.js';
import { UpdateClientCategoryDto } from './dto/update-client-category.dto.js';

@Controller('client-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientCategoriesController {
  constructor(
    private readonly clientCategoriesService: ClientCategoriesService,
  ) {}

  @Get()
  findAll() {
    return this.clientCategoriesService.findAll();
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId', ParseIdPipe) clientId: number) {
    return this.clientCategoriesService.findByClient(clientId);
  }

  @Post()
  create(@Body() dto: CreateClientCategoryDto) {
    return this.clientCategoriesService.create(dto);
  }

  @Patch(':clientId/:category')
  update(
    @Param('clientId', ParseIdPipe) clientId: number,
    @Param('category', new ParseEnumPipe(SupplyCategory))
    category: SupplyCategory,
    @Body() dto: UpdateClientCategoryDto,
  ) {
    return this.clientCategoriesService.update(clientId, category, dto);
  }

  @Delete(':clientId/:category')
  delete(
    @Param('clientId', ParseIdPipe) clientId: number,
    @Param('category', new ParseEnumPipe(SupplyCategory))
    category: SupplyCategory,
  ) {
    return this.clientCategoriesService.delete(clientId, category);
  }
}