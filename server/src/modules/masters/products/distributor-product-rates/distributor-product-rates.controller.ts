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

import { CreateDistributorProductRatesDto } from './dto/create-distributor-product-rates.dto.js';
import { UpdateDistributorProductRatesDto } from './dto/update-distributor-product-rates.dto.js';
import { DistributorProductRatesService } from './distributor-product-rates.service.js';

@Controller('distributor-product-rates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DistributorProductRatesController {
  constructor(
    private readonly distributorProductRatesService: DistributorProductRatesService,
  ) {}

  @Get()
  findAll() {
    return this.distributorProductRatesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.distributorProductRatesService.findActive();
  }

  @Get(':id')
  findById(@Param('id', ParseIdPipe) id: number) {
    return this.distributorProductRatesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateDistributorProductRatesDto) {
    return this.distributorProductRatesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateDistributorProductRatesDto,
  ) {
    return this.distributorProductRatesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIdPipe) id: number) {
    return this.distributorProductRatesService.delete(id);
  }
}
