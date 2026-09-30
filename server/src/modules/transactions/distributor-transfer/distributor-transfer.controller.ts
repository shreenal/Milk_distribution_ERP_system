import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { DistributorTransferService } from './distributor-transfer.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { GenerateTransferDto } from './dto/generate-transfer.dto.js';
import { Throttle } from '@nestjs/throttler';

@Controller('distributor-transfer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributorTransferController {
  constructor(
    private readonly distributorTransferService: DistributorTransferService,
  ) {}

  @Get(':paperId')
  @Roles('EMPLOYEE')
  getTransferSummary(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.distributorTransferService.getTransferSummary(paperId);
  }

  @Post(':paperId/generate')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  generateTransfer(
    @Param('paperId', ParseIntPipe) paperId: number,
    @Body() dto: GenerateTransferDto,
  ) {
    return this.distributorTransferService.generateTransfer(paperId, {
      expectedUpdatedAt: dto?.expectedUpdatedAt,
    });
  }
}
