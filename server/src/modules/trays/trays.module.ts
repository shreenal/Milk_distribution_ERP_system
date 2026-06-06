import { Module } from '@nestjs/common';

import { TraysController } from './trays.controller.js';
import { TraysRepository } from './trays.repository.js';
import { TraysService } from './trays.service.js';
import { TrayBillingBuilder } from './tray.billing-builder.js';
import { TraysValidationService } from './trays-validation.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';


@Module({
  imports:[WorkflowModule],

  controllers: [
    TraysController,
  ],

  providers: [
    TraysService,
    TraysRepository,
    TrayBillingBuilder,
    TraysValidationService
  ],

  exports: [
    TraysService,
    TraysRepository,
    TrayBillingBuilder,
    TraysValidationService
  ],
})
export class TraysModule {}