import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { DistributorController } from './distributor.controller.js';
import { DistributorRepository } from './distributor.repository.js';
import { DistributorService } from './distributor.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DistributorController],
  providers: [DistributorService, DistributorRepository],
  exports: [DistributorService, DistributorRepository],
})
export class DistributorModule {}
