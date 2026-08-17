import { Module } from '@nestjs/common';

import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import { OrdersBuilder } from './order.builder.js';
import { OrdersValidationService } from './services/orders-validation.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { VehicleAllocationModule } from '../vehicle-allocation/vehicle-allocation.module.js';
import { OrderCommercialService } from './services/order-commercial.service.js';
import { NightBillingService } from './services/night-billing.service.js';
import { FinalBillingService } from './services/final-billing.service.js';
import { BillingService } from './services/billing.service.js';
import { DependencyModule } from '../dependencies/dependency.module.js';

@Module({
  imports: [WorkflowModule, VehicleAllocationModule, DependencyModule],

  controllers: [OrdersController],

  providers: [
    OrdersService,
    OrdersRepository,
    OrdersBuilder,
    OrdersValidationService,
    ProductColumnsBuilder,
    OrderCommercialService,
    NightBillingService,
    FinalBillingService,
    BillingService,
  ],

  exports: [
    OrdersService,
    OrdersRepository,
    OrdersValidationService,
    ProductColumnsBuilder,
  ],
})
export class OrdersModule {}
