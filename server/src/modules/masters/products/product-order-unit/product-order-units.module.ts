import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { OrderUnitTypesModule } from '../order-unit-types/order-unit-types.module.js';

import { ProductOrderUnitsController } from './product-order-units.controller.js';
import { ProductOrderUnitsRepository } from './product-order-units.repository.js';
import { ProductOrderUnitsService } from './product-order-units.service.js';

@Module({
  imports: [PrismaModule, OrderUnitTypesModule],
  controllers: [ProductOrderUnitsController],
  providers: [ProductOrderUnitsService, ProductOrderUnitsRepository],
  exports: [ProductOrderUnitsService, ProductOrderUnitsRepository],
})
export class ProductOrderUnitsModule {}
