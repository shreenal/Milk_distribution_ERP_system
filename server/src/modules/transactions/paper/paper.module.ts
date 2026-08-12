import { Module } from '@nestjs/common';

import { PaperController } from './paper.controller.js';
import { PaperService } from './paper.service.js';
import { PaperValidationService } from './services/paper-validation.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ClientTraysModule } from '../client-trays/client-trays.module.js';
import { CollectionsModule } from '../collections/collections.module.js';
import { VehicleAllocationModule } from '../vehicle-allocation/vehicle-allocation.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaperRepository } from './paper.repository.js';
import { PurchaseModule } from '../purchase/purchase.module.js';
import { CashSettlementModule } from '../cash-settlement/cash-settlement.module.js';
import { DairyTraysModule } from '../dairy-trays/dairy-trays.module.js';
import { DistributorTransferModule } from '../distributor-transfer/distributor-transfer.module.js';

@Module({
  imports: [
    WorkflowModule,
    OrdersModule,
    ClientTraysModule,
    CollectionsModule,
    VehicleAllocationModule,
    PurchaseModule,
    CashSettlementModule,
    DairyTraysModule,
    DistributorTransferModule,
  ],

  controllers: [PaperController],

  providers: [PaperService, PaperValidationService, PaperRepository],

  exports: [PaperService, PaperValidationService],
})
export class PaperModule {}
