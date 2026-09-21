import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { OrderUnitTypesController } from './order-unit-types.controller.js';
import { OrderUnitTypesRepository } from './order-unit-types.repository.js';
import { OrderUnitTypesService } from './order-unit-types.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [OrderUnitTypesController],
  providers: [
    OrderUnitTypesService,
    OrderUnitTypesRepository,
  ],
  exports: [
    OrderUnitTypesService,
    OrderUnitTypesRepository,
  ],
})
export class OrderUnitTypesModule {}

