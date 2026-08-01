import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { DistributorModule } from '../distributors/distributor.module.js';

import { TransferRulesController } from './transfer-rules.controller.js';
import { TransferRulesRepository } from './transfer-rules.repository.js';
import { TransferRulesService } from './transfer-rules.service.js';

@Module({
  imports: [
    PrismaModule,
    DistributorModule,
  ],
  controllers: [TransferRulesController],
  providers: [
    TransferRulesService,
    TransferRulesRepository,
  ],
  exports: [
    TransferRulesService,
    TransferRulesRepository,
  ],
})
export class TransferRulesModule {}