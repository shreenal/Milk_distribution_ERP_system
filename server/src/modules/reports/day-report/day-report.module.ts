import { Module } from '@nestjs/common';

import { DayReportController } from './day-report.controller.js';
import { DayReportService } from './day-report.service.js';
import { DayReportRepository } from './day-report.repository.js';

import { CashSettlementCalculationService } from '../../../common/calculators/cash-settlement.calculator.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';

@Module({
  controllers: [DayReportController],

  providers: [
    DayReportService,
    DayReportRepository,
    CashSettlementCalculationService,
    PurchaseVarianceCalculator,
  ],
})
export class DayReportModule {}
