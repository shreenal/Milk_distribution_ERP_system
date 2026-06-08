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


@Module({
  imports: [PrismaModule,
    WorkflowModule,
    OrdersModule,
    TraysModule,
    CollectionsModule,
    VehicleAllocationModule,
    AuthModule,],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
