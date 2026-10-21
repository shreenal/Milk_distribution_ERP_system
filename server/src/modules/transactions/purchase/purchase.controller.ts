import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { PurchaseService } from './purchase.service.js';
import { PurchaseAdminService } from './services/purchase-admin.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { SavePurchaseDto } from './dto/purchase.dto.js';
import { RecalculatePurchaseRatesDto } from './dto/recalculate-purchase-rates.dto.js';
import { SignOffZeroAllocationDto } from './dto/sign-off-zero-allocation.dto.js';
import { Throttle } from '@nestjs/throttler';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

type AuthRequest = Request & {
  user: { id: number; username: string; role: string };
};

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseController {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly purchaseAdminService: PurchaseAdminService,
  ) {}

  @Get(':paperId')
  @Roles('EMPLOYEE')
  async getPurchases(@Param('paperId', ParseIdPipe) paperId: number) {
    return this.purchaseService.getPurchases(paperId);
  }

  @Post(':paperId')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  savePurchases(
    @Param('paperId', ParseIdPipe) paperId: number,
    @Body() dto: SavePurchaseDto,
    @Req() req: AuthRequest,
  ) {
    return this.purchaseService.savePurchases(paperId, dto, req.user);
  }

  // PD-23: ADMIN-only, REOPENED papers only.
  @Post(':paperId/recalculate-rates')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  recalculateRates(
    @Param('paperId', ParseIdPipe) paperId: number,
    @Body() dto: RecalculatePurchaseRatesDto,
    @Req() req: AuthRequest,
  ) {
    return this.purchaseAdminService.recalculateRates(paperId, dto, req.user);
  }

  // PD-38
  @Post(':paperId/sign-off-zero-allocation')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  signOffZeroAllocation(
    @Param('paperId', ParseIdPipe) paperId: number,
    @Body() dto: SignOffZeroAllocationDto,
    @Req() req: AuthRequest,
  ) {
    return this.purchaseAdminService.signOffZeroAllocation(
      paperId,
      dto,
      req.user,
    );
  }
}
