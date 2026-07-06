import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module.js';

import { CashSettlementController } from './cash-settlement.controller.js';

import { CashSettlementService } from './cash-settlement.service.js';

import { CashSettlementRepository } from './cash-settlement.repository.js';

import { CashSettlementBuilder } from './cash-settlement.builder.js';

import { CashSettlementValidationService } from './cash-settlement-validation.service.js';

import { WorkflowModule } from '../workflow/workflow.module.js';

@Module({
  imports: [PrismaModule, WorkflowModule],
  controllers: [CashSettlementController],
  providers: [
    CashSettlementService,
    CashSettlementRepository,
    CashSettlementBuilder,
    CashSettlementValidationService,
  ],
  exports: [CashSettlementService, CashSettlementValidationService],
})
export class CashSettlementModule {}
