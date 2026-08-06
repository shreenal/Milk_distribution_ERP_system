import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { BrandsModule } from '../../products/brands/brands.module.js';
import { DistributorModule } from '../distributors/distributor.module.js';
import { ProductGroupModule } from '../../products/product-groups/product-group.module.js';

import { ProcurementRulesController } from './procurement-rules.controller.js';
import { ProcurementRulesRepository } from './procurement-rules.repository.js';
import { ProcurementRulesService } from './procurement-rules.service.js';

@Module({
  imports: [PrismaModule, DistributorModule, BrandsModule, ProductGroupModule],
  controllers: [ProcurementRulesController],
  providers: [ProcurementRulesService, ProcurementRulesRepository],
  exports: [ProcurementRulesService, ProcurementRulesRepository],
})
export class ProcurementRulesModule {}
