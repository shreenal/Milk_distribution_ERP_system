import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';
import { BrandsModule } from '../brands/brands.module.js';

import { TrayTypesController } from './tray-types.controller.js';
import { TrayTypesRepository } from './tray-types.repository.js';
import { TrayTypesService } from './tray-types.service.js';

@Module({
  imports: [
    PrismaModule,
    BrandsModule,
  ],
  controllers: [TrayTypesController],
  providers: [TrayTypesService, TrayTypesRepository],
  exports: [TrayTypesService,TrayTypesRepository],
})
export class TrayTypesModule {}