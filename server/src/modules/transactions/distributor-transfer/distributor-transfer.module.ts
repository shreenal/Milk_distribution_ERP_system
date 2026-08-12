import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../prisma/prisma.module.js';

import { DistributorTransferController } from './distributor-transfer.controller.js';
import { DistributorTransferService } from './distributor-transfer.service.js';
import { DistributorTransferRepository } from './distributor-transfer.repository.js';
import { DistributorTransferBuilder } from './distributor-transfer.builder.js';
import { DistributorTransferValidationService } from './services/distributor-transfer-validation.service.js';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { DistributorTransferPropagationService } from './services/distributor-transfer-propagation.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DistributorTransferController],
  providers: [
    DistributorTransferService,
    DistributorTransferRepository,
    DistributorTransferBuilder,
    DistributorTransferValidationService,
    ProductColumnsBuilder,
    DistributorTransferPropagationService,
  ],
  exports: [
    DistributorTransferService,
    DistributorTransferBuilder,
    DistributorTransferRepository,
    DistributorTransferValidationService,
    DistributorTransferPropagationService,
  ],
})
export class DistributorTransferModule {}
