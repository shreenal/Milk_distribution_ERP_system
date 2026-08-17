import { Module } from '@nestjs/common';

import { PurchaseController } from './purchase.controller.js';

import { PurchaseService } from './purchase.service.js';

import { PurchaseRepository } from './purchase.repository.js';

import { PurchaseBuilder } from './purchase.builder.js';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { PurchaseValidationService } from './services/purchase-validation.service.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { PurchaseVarianceCalculator } from '../../../common/calculators/purchase-variance.calculator.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { PurchaseCommercialService } from './services/purchase-commercial.service.js';
import { DependencyModule } from '../dependencies/dependency.module.js';

@Module({
  imports: [WorkflowModule, DependencyModule],

  controllers: [PurchaseController],

  providers: [
    PurchaseService,

    PurchaseRepository,

    PurchaseBuilder,

    PurchaseValidationService,

    ProductColumnsBuilder,

    OrderItemsRepository,
    AllocationSummaryBuilder,
    PurchaseVarianceCalculator,
    PurchaseBillingService,
    PurchaseCommercialService,
  ],

  exports: [PurchaseService, PurchaseValidationService],
})
export class PurchaseModule {}
