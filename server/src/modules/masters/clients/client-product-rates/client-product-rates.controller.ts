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
import { ClientProductRatesService } from './client-product-rates.service.js';
import { CreateClientProductRateDto } from './dto/create-client-product-rate.dto.js';
import { UpdateClientProductRateDto } from './dto/update-client-product-rate.dto.js';

@Controller('client-product-rates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientProductRatesController {
  constructor(
    private readonly clientProductRatesService: ClientProductRatesService,
  ) {}

  @Get()
  findAll() {
    return this.clientProductRatesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.clientProductRatesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.clientProductRatesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateClientProductRateDto) {
    return this.clientProductRatesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientProductRateDto,
  ) {
    return this.clientProductRatesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.clientProductRatesService.delete(id);
  }
}
