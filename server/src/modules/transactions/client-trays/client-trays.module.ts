import { Module } from '@nestjs/common';

import { ClientTraysController } from './client-trays.controller.js';
import { ClientTraysRepository } from './client-trays.repository.js';
import { ClientTraysService } from './client-trays.service.js';
import { ClientTraysBuilder } from './client-trays.builder.js';
import { ClientTraysValidationService } from './services/client-trays-validation.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

@Module({
  imports: [WorkflowModule],

  controllers: [ClientTraysController],

  providers: [
    ClientTraysService,
    ClientTraysRepository,
    ClientTraysBuilder,
    ClientTraysValidationService,
    TrayCalculationService,
  ],

  exports: [
    ClientTraysService,
    ClientTraysRepository,
    ClientTraysBuilder,
    ClientTraysValidationService,
    TrayCalculationService,
  ],
})
export class ClientTraysModule {}
