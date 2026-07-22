import { Module } from '@nestjs/common';
import { DairyTrayTrackingValidationService } from './dairy-tray-tracking-validation.service.js';
import { DairyTrayTrackingBuilder } from './dairy-tray-tracking.builder.js';
import { DairyTrayTrackingController } from './dairy-tray-tracking.controller.js';
import { DairyTrayTrackingRepository } from './dairy-tray-tracking.repository.js';
import { DairyTrayTrackingService } from './dairy-tray-tracking.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';

@Module({
  imports: [WorkflowModule],
  controllers: [DairyTrayTrackingController],
  providers: [
    DairyTrayTrackingService,
    DairyTrayTrackingRepository,
    DairyTrayTrackingBuilder,
    DairyTrayTrackingValidationService,
  ],
  exports: [
    DairyTrayTrackingService,
    DairyTrayTrackingRepository,
    DairyTrayTrackingBuilder,
    DairyTrayTrackingValidationService,
  ],
})
export class DairyTrayTrackingModule {}
