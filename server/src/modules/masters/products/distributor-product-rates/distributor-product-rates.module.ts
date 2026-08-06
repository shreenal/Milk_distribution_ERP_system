import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { ProductLinksModule } from '../product-links/product-links.module.js';

import { DistributorProductRatesController } from './distributor-product-rates.controller.js';
import { DistributorProductRatesRepository } from './distributor-product-rates.repository.js';
import { DistributorProductRatesService } from './distributor-product-rates.service.js';

@Module({
  imports: [PrismaModule, ProductLinksModule],
  controllers: [DistributorProductRatesController],
  providers: [
    DistributorProductRatesService,
    DistributorProductRatesRepository,
  ],
  exports: [DistributorProductRatesService, DistributorProductRatesRepository],
})
export class DistributorProductRatesModule {}
