import { Module } from '@nestjs/common';

import { DeliverySummaryController } from './delivery-summary.controller.js';

import { DeliverySummaryService } from './delivery-summary.service.js';

import { DeliverySummaryBuilder } from './delivery-summary.builder.js';

import { DeliverySummaryRepository } from './delivery-summary.repository.js';

import { PrismaModule } from '../../prisma/prisma.module.js';

import { ProductColumnsBuilder } from '../../common/builders/product-columns.builder.js';

@Module({
  imports: [PrismaModule],

  controllers: [DeliverySummaryController],

  providers: [
    DeliverySummaryService,

    DeliverySummaryBuilder,

    DeliverySummaryRepository,

    ProductColumnsBuilder,
  ],

  exports: [DeliverySummaryService],
})
export class DeliverySummaryModule {}
