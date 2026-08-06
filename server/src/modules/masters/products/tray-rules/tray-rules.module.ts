import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { BrandsModule } from '../brands/brands.module.js';
import { PackagingTypeModule } from '../packaging-types/packaging-type.module.js';
import { ProductGroupModule } from '../product-groups/product-group.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { TrayTypesModule } from '../tray-types/tray-types.module.js';

import { TrayRulesController } from './tray-rules.controller.js';
import { TrayRulesRepository } from './tray-rules.repository.js';
import { TrayRulesService } from './tray-rules.service.js';

@Module({
  imports: [
    PrismaModule,
    ProductGroupModule,
    BrandsModule,
    ProductTypesModule,
    PackagingTypeModule,
    TrayTypesModule,
  ],
  controllers: [TrayRulesController],
  providers: [TrayRulesService, TrayRulesRepository],
  exports: [TrayRulesService, TrayRulesRepository],
})
export class TrayRulesModule {}
