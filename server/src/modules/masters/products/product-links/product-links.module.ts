import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { DistributorModule } from '../../distribution/distributors/distributor.module.js';
import { ProductsModule } from '../products/products.module.js';

import { ProductLinksController } from './product-links.controller.js';
import { ProductLinksRepository } from './product-links.repository.js';
import { ProductLinksService } from './product-links.service.js';

@Module({
  imports: [
    PrismaModule,
    DistributorModule,
    ProductsModule,
  ],
  controllers: [ProductLinksController],
  providers: [
    ProductLinksService,
    ProductLinksRepository,
  ],
  exports: [
    ProductLinksService,
    ProductLinksRepository,
  ],
})
export class ProductLinksModule {}