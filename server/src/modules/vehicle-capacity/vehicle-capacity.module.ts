import { forwardRef, Module } from '@nestjs/common';
import { VehicleCapacityController } from './vehicle-capacity.controller.js';
import { VehicleCapacityBuilder } from './vehicle-capacity.builder.js';
import { VehicleCapacityRepository } from './vehicle-capacity.repository.js';
import { VehicleCapacityService } from './vehicle-capacity.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';

@Module({
  imports: [
    WorkflowModule,
  ],  

  controllers: [
    VehicleCapacityController,
  ],

  providers: [
    VehicleCapacityBuilder,
    VehicleCapacityRepository,
    VehicleCapacityService,
    ProductColumnsBuilder,
  ],

  exports: [
    VehicleCapacityService,
    VehicleCapacityRepository,
    ProductColumnsBuilder,
  ],
})
export class VehicleCapacityModule {}