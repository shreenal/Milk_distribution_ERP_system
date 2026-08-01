import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { VehiclesModule } from '../vehicles/vehicles.module.js';

import { DriversController } from './drivers.controller.js';
import { DriversRepository } from './drivers.repository.js';
import { DriversService } from './drivers.service.js';

@Module({
  imports: [
    PrismaModule,
    VehiclesModule,
  ],
  controllers: [DriversController],
  providers: [
    DriversService,
    DriversRepository,
  ],
  exports: [
    DriversService,
    DriversRepository,
  ],
})
export class DriversModule {}