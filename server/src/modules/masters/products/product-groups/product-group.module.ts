import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { ProductGroupController } from './product-group.controller.js';
import { ProductGroupRepository } from './product-group.repository.js';
import { ProductGroupService } from './product-group.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProductGroupController],
  providers: [ProductGroupService, ProductGroupRepository],
  exports: [ProductGroupService, ProductGroupRepository],
})
export class ProductGroupModule {}
