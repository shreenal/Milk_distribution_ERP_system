import { forwardRef, Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { BrandsModule } from '../brands/brands.module.js';
import { ProductGroupModule } from '../product-groups/product-group.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { OrderUnitTypesModule } from '../order-unit-types/order-unit-types.module.js';
import { ProductOrderUnitsModule } from '../product-order-unit/product-order-units.module.js';
import { PackagingTypeModule } from '../packaging-types/packaging-type.module.js';

import { ProductsController } from './products.controller.js';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [
    PrismaModule,
    BrandsModule,
    ProductGroupModule,
    ProductTypesModule,
    PackagingTypeModule,
    OrderUnitTypesModule,
    forwardRef(() => ProductOrderUnitsModule),
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService, ProductsRepository],
})
export class ProductsModule {}
