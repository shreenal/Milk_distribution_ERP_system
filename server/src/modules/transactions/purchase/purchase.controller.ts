import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PurchaseService } from './purchase.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SavePurchaseDto } from './dto/purchase.dto.js';
import { Throttle } from '@nestjs/throttler';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Get(':paperId')
  @Roles('EMPLOYEE')
  async getPurchases(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.purchaseService.getPurchases(paperId);
  }

  @Post(':paperId')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  savePurchases(
    @Param('paperId', ParseIntPipe)
    paperId: number,
    @Body()
    dto: SavePurchaseDto,
  ) {
    return this.purchaseService.savePurchases(paperId, dto);
  }
}
