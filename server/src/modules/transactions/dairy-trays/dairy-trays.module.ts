import { Module } from '@nestjs/common';
import { DairyTraysValidationService } from './services/dairy-trays-validation.service.js';
import { DairyTraysBuilder } from './dairy-trays.builder.js';
import { DairyTraysController } from './dairy-trays.controller.js';
import { DairyTraysRepository } from './dairy-trays.repository.js';
import { DairyTraysService } from './dairy-trays.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

@Module({
  imports: [WorkflowModule],
  controllers: [DairyTraysController],
  providers: [
    DairyTraysService,
    DairyTraysRepository,
    DairyTraysBuilder,
    DairyTraysValidationService,
    TrayCalculationService,
  ],
  exports: [
    DairyTraysService,
    DairyTraysRepository,
    DairyTraysBuilder,
    DairyTraysValidationService,
  ],
})
export class DairyTraysModule {}
