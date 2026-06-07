import { forwardRef, Module } from '@nestjs/common';

import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import { OrdersBillingBuilder } from './order.billing-builder.js';
import { OrdersValidationService } from './orders-validation.service.js';
import { TraysModule } from '../trays/trays.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { CollectionsModule } from '../collections/collections.module.js';
import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';


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
    ProductColumnsBuilder
  ],

  exports: [
    OrdersService,
    OrdersRepository,
    OrdersValidationService,
    ProductColumnsBuilder,
  ],
})
export class OrdersModule {}