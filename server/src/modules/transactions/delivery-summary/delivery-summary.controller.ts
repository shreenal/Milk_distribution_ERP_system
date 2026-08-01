import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { DeliverySummaryService } from './delivery-summary.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';

@Controller('delivery-summary')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliverySummaryController {
  constructor(
    private readonly deliverySummaryService: DeliverySummaryService,
  ) {}

  @Get(':paperId')
  @Roles('EMPLOYEE')
  async getBillingGroupSummary(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.deliverySummaryService.getBillingGroupSummary(paperId);
  }
}
