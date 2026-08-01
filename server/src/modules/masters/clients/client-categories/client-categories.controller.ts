import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupplyCategory } from '../../../../generated/prisma/client.js';

import { JwtAuthGuard } from '../../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../../transactions/auth/roles.guard.js';
import { Roles } from '../../../transactions/auth/roles.decorator.js';

import { ClientCategoriesService } from './client-categories.service.js';
import { CreateClientCategoryDto } from './dto/create-client-category.dto.js';

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
  findByClient(
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    return this.clientCategoriesService.findByClient(clientId);
  }

  @Post()
  create(
    @Body() dto: CreateClientCategoryDto,
  ) {
    return this.clientCategoriesService.create(dto);
  }

  @Delete(':clientId/:category')
  delete(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('category', new ParseEnumPipe(SupplyCategory))
    category: SupplyCategory,
  ) {
    return this.clientCategoriesService.delete(
      clientId,
      category,
    );
  }
}