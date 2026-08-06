import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { BrandsModule } from '../brands/brands.module.js';

import { ProductTypesController } from './product-types.controller.js';
import { ProductTypesService } from './product-types.service.js';
import { ProductTypesRepository } from './product-types.repository.js';

@Module({
  imports: [PrismaModule, BrandsModule],
  controllers: [ProductTypesController],
  providers: [ProductTypesService, ProductTypesRepository],
  exports: [ProductTypesService, ProductTypesRepository],
})
export class ProductTypesModule {}
