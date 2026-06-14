import { Module } from '@nestjs/common';

import { PaperController } from './paper.controller.js';
import { PaperService } from './paper.service.js';
import { PaperValidationService } from './paper-validation.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { TraysValidationService } from '../trays/trays-validation.service.js';
import { CollectionsValidationService } from '../collections/collections-validation.service.js';
import { VehicleAllocationValidationService } from '../vehicle-allocation/vehicle-allocation-validation.service.js';
import { TraysModule } from '../trays/trays.module.js';
import { CollectionsModule } from '../collections/collections.module.js';
import { VehicleAllocationModule } from '../vehicle-allocation/vehicle-allocation.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaperRepository } from './paper.repository.js';
import { PurchaseModule } from '../purchase/purchase.module.js';

@Module({
  imports: [
    WorkflowModule,
    OrdersModule,
    TraysModule,
    CollectionsModule,
    VehicleAllocationModule,
    PurchaseModule,
  ],
  controllers: [PaperController],

  providers: [PaperService, PaperValidationService, PaperRepository],

  exports: [PaperService, PaperValidationService],
})
export class PaperModule {}
