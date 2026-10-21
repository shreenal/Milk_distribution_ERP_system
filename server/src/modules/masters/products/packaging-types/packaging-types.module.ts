import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { PackagingTypesController } from './packaging-types.controller.js';
import { PackagingTypesRepository } from './packaging-types.repository.js';
import { PackagingTypesService } from './packaging-types.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PackagingTypesController],
  providers: [PackagingTypesService, PackagingTypesRepository],
  exports: [PackagingTypesService, PackagingTypesRepository],
})
export class PackagingTypeModule {}
