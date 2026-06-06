import { forwardRef, Module } from '@nestjs/common';

import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import { OrdersBillingBuilder } from './order.billing-builder.js';
import { OrdersValidationService } from './orders-validation.service.js';
import { TraysModule } from '../trays/trays.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { WorkflowOrchestrator } from '../workflow/workflow-orchestrator.js';
import { CollectionsModule } from '../collections/collections.module.js';

@Module({
   imports: [TraysModule,CollectionsModule,WorkflowModule],

  controllers: [
    OrdersController,
  ],

  providers: [
    OrdersService,
    OrdersRepository,
    OrdersBillingBuilder,
    OrdersValidationService,
  ],

  exports: [
    OrdersService,
    OrdersRepository,
    OrdersValidationService,
  ],
})
export class OrdersModule {}