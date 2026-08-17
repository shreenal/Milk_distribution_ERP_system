import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrdersModule } from './modules/transactions/orders/orders.module.js';
import { ClientTraysModule } from './modules/transactions/client-trays/client-trays.module.js';
import { CollectionsModule } from './modules/transactions/collections/collections.module.js';
import { WorkflowModule } from './modules/transactions/workflow/workflow.module.js';
import { AuthModule } from './modules/transactions/auth/auth.module.js';
import { VehicleAllocationModule } from './modules/transactions/vehicle-allocation/vehicle-allocation.module.js';
import { PaperModule } from './modules/transactions/paper/paper.module.js';
import { PurchaseModule } from './modules/transactions/purchase/purchase.module.js';
import { DeliverySummaryModule } from './modules/transactions/delivery-summary/delivery-summary.module.js';
import { CashSettlementModule } from './modules/transactions/cash-settlement/cash-settlement.module.js';
import { DistributorTransferModule } from './modules/transactions/distributor-transfer/distributor-transfer.module.js';
import { DairyTraysModule } from './modules/transactions/dairy-trays/dairy-trays.module.js';
import { BanksModule } from './modules/masters/finance/banks/banks.module.js';
import { ExpenseTypesModule } from './modules/masters/finance/expense-types/expense-types.module.js';
import { BrandsModule } from './modules/masters/products/brands/brands.module.js';
import { DairiesModule } from './modules/masters/products/dairies/dairies.module.js';
import { ProductTypesModule } from './modules/masters/products/product-types/product-types.module.js';
import { TrayTypesModule } from './modules/masters/products/tray-types/tray-types.module.js';
import { ProductGroupModule } from './modules/masters/products/product-groups/product-group.module.js';
import { PackagingTypeModule } from './modules/masters/products/packaging-types/packaging-type.module.js';
import { ProductsModule } from './modules/masters/products/products/products.module.js';
import { DistributorModule } from './modules/masters/distribution/distributors/distributor.module.js';
import { EmployeesModule } from './modules/masters/fleet/employees/employees.module.js';
import { DriversModule } from './modules/masters/fleet/drivers/drivers.module.js';
import { VehiclesModule } from './modules/masters/fleet/vehicles/vehicles.module.js';
import { GroupsModule } from './modules/masters/clients/groups/groups.module.js';
import { ClientsModule } from './modules/masters/clients/clients/clients.module.js';
import { ClientCategoriesModule } from './modules/masters/clients/client-categories/client-categories.module.js';
import { ProductLinksModule } from './modules/masters/products/product-links/product-links.module.js';
import { ClientProductRatesModule } from './modules/masters/clients/client-product-rates/client-product-rates.module.js';
import { DistributorProductRatesModule } from './modules/masters/products/distributor-product-rates/distributor-product-rates.module.js';
import { RolesModule } from './modules/masters/administration/roles/roles.module.js';
import { UsersModule } from './modules/masters/administration/users/users.module.js';
import { TrayRulesModule } from './modules/masters/products/tray-rules/tray-rules.module.js';
import { ProcurementRulesModule } from './modules/masters/distribution/procurement-rules/procurement-rules.module.js';
import { TransferRulesModule } from './modules/masters/distribution/transfer-rules/transfer-rules.module.js';
import { ConfigModule } from '@nestjs/config';
import { GroupSupplyRulesModule } from './modules/masters/distribution/group-supply-rules/group-supply-rules.module.js';
import { ReportModule } from './modules/reports/report.module.js';
import { DependencyModule } from './modules/transactions/dependencies/dependency.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    WorkflowModule,
    OrdersModule,
    ClientTraysModule,
    CollectionsModule,
    VehicleAllocationModule,
    AuthModule,
    PaperModule,
    PurchaseModule,
    DeliverySummaryModule,
    CashSettlementModule,
    DistributorTransferModule,
    DairyTraysModule,
    BanksModule,
    ExpenseTypesModule,
    BrandsModule,
    DairiesModule,
    ProductTypesModule,
    TrayTypesModule,
    ProductGroupModule,
    PackagingTypeModule,
    ProductsModule,
    DistributorModule,
    EmployeesModule,
    DriversModule,
    VehiclesModule,
    GroupsModule,
    ClientsModule,
    ClientCategoriesModule,
    ProductLinksModule,
    ClientProductRatesModule,
    DistributorProductRatesModule,
    RolesModule,
    UsersModule,
    TrayRulesModule,
    ProcurementRulesModule,
    TransferRulesModule,
    GroupSupplyRulesModule,
    ReportModule,
    DependencyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
