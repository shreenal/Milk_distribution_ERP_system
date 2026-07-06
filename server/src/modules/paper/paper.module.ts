import { Module } from '@nestjs/common';

import { PaperController } from './paper.controller.js';
import { PaperService } from './paper.service.js';
import { PaperValidationService } from './paper-validation.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { TraysModule } from '../trays/trays.module.js';
import { CollectionsModule } from '../collections/collections.module.js';
import { VehicleAllocationModule } from '../vehicle-allocation/vehicle-allocation.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaperRepository } from './paper.repository.js';
import { PurchaseModule } from '../purchase/purchase.module.js';
import { CashSettlementModule } from '../cash-settlement/cash-settlement.module.js';
import { DistributorTransferModule } from '../distributor-transfer/distributor-transfer.module.js';
import {DairyTrayTrackingModule} from '../dairy-tray-tracking/dairy-tray-tracking.module.js';

@Module({
  imports: [
    WorkflowModule,
    OrdersModule,
    TraysModule,
    CollectionsModule,
    VehicleAllocationModule,
    PurchaseModule,
    CashSettlementModule,
    DistributorTransferModule,
    DairyTrayTrackingModule,
  ],
  
  controllers: [PaperController],

  providers: [PaperService, PaperValidationService, PaperRepository],

  exports: [PaperService, PaperValidationService],
})
export class PaperModule {}
