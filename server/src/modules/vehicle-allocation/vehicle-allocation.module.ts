import { Module } from '@nestjs/common';
import { VehicleAllocationController } from './vehicle-allocation.controller.js';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';
import { VehicleAllocationValidationService } from './vehicle-allocation-validation.service.js';
import { OrderItemsRepository } from '../../common/repositories/order-items.repository.js';
import { AllocationSummaryBuilder } from '../../common/builders/allocation-summary.builder.js';

@Module({
  imports: [WorkflowModule],

  controllers: [VehicleAllocationController],

  providers: [
    VehicleAllocationBuilder,
    VehicleAllocationRepository,
    VehicleAllocationService,
    ProductColumnsBuilder,
    VehicleAllocationValidationService,
    OrderItemsRepository,
    AllocationSummaryBuilder,
  ],

  exports: [
    VehicleAllocationService,
    VehicleAllocationRepository,
    ProductColumnsBuilder,
    VehicleAllocationValidationService,
  ],
})
export class VehicleAllocationModule {}
