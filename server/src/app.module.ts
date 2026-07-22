import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { TraysModule } from './modules/trays/trays.module.js';
import { CollectionsModule } from './modules/collections/collections.module.js';
import { WorkflowModule } from './modules/workflow/workflow.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { VehicleAllocationModule } from './modules/vehicle-allocation/vehicle-allocation.module.js';
import { PaperModule } from './modules/paper/paper.module.js';
import { PurchaseModule } from './modules/purchase/purchase.module.js';
import { DeliverySummaryModule } from './modules/delivery-summary/delivery-summary.module.js';
import { CashSettlementModule } from './modules/cash-settlement/cash-settlement.module.js';
import { DistributorTransferModule } from './modules/distributor-transfer/distributor-transfer.module.js';
import { DairyTrayTrackingModule } from './modules/dairy-tray-tracking/dairy-tray-tracking.module.js';

@Module({
  imports: [
    PrismaModule,
    WorkflowModule,
    OrdersModule,
    TraysModule,
    CollectionsModule,
    VehicleAllocationModule,
    AuthModule,
    PaperModule,
    PurchaseModule,
    DeliverySummaryModule,
    CashSettlementModule,
    DistributorTransferModule,
    DairyTrayTrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
