import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { ClientsModule } from '../clients/clients.module.js';
import { ProductLinksModule } from '../../products/product-links/product-links.module.js';

import { ClientProductRatesController } from './client-product-rates.controller.js';
import { ClientProductRatesRepository } from './client-product-rates.repository.js';
import { ClientProductRatesService } from './client-product-rates.service.js';

@Module({
  imports: [PrismaModule, ClientsModule, ProductLinksModule],
  controllers: [ClientProductRatesController],
  providers: [ClientProductRatesService, ClientProductRatesRepository],
  exports: [ClientProductRatesService, ClientProductRatesRepository],
})
export class ClientProductRatesModule {}
