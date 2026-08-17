import { Module } from '@nestjs/common';

import { ClientStatementModule } from './client-statement/client-statement.module.js';
import { DayReportModule } from './day-report/day-report.module.js';

@Module({
  imports: [ClientStatementModule, DayReportModule],
})
export class ReportModule {}
