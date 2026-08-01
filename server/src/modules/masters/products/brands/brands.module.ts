import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';
import { BrandsRepository } from './brands.repository.js';
import { DairiesModule } from '../dairies/dairies.module.js';

@Module({
  imports: [PrismaModule,DairiesModule],
  controllers: [BrandsController],
  providers: [BrandsService, BrandsRepository],
  exports: [BrandsService,BrandsRepository],
})
export class BrandsModule {}