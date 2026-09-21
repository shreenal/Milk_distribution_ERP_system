import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { GroupsModule } from '../../clients/groups/groups.module.js';
import { ProductsModule } from '../../products/products/products.module.js';
import { DistributorModule } from '../distributors/distributor.module.js';

import { DistributorProductPrioritiesController } from './distributor-product-priorities.controller.js';
import { DistributorProductPrioritiesRepository } from './distributor-product-priorities.repository.js';
import { DistributorProductPrioritiesService } from './distributor-product-priorities.service.js';

@Module({
  imports: [PrismaModule, GroupsModule, ProductsModule, DistributorModule],
  controllers: [DistributorProductPrioritiesController],
  providers: [
    DistributorProductPrioritiesService,
    DistributorProductPrioritiesRepository,
  ],
  exports: [
    DistributorProductPrioritiesService,
    DistributorProductPrioritiesRepository,
  ],
})
export class DistributorProductPrioritiesModule {}
