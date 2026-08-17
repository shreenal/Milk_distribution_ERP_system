import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { DayReportService } from './day-report.service.js';
import { DayReportQueryDto } from './dto/day-report-query.dto.js';

import { JwtAuthGuard } from '../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../transactions/auth/roles.guard.js';
import { Roles } from '../../transactions/auth/roles.decorator.js';

@Controller('reports/day-report')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DayReportController {
  constructor(private readonly dayReportService: DayReportService) {}

  @Get()
  @Roles('EMPLOYEE')
  async generateDayReport(@Query() query: DayReportQueryDto) {
    return this.dayReportService.getDayReport(new Date(query.date));
  }
}
