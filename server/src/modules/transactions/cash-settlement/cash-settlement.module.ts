import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../prisma/prisma.module.js';

import { CashSettlementController } from './cash-settlement.controller.js';

import { CashSettlementService } from './cash-settlement.service.js';

import { CashSettlementRepository } from './cash-settlement.repository.js';

import { CashSettlementBuilder } from './cash-settlement.builder.js';

import { CashSettlementValidationService } from './services/cash-settlement-validation.service.js';

import { CashSettlementCalculationService } from '../../../common/calculators/cash-settlement.calculator.js';

import { WorkflowModule } from '../workflow/workflow.module.js';

@Module({
  imports: [PrismaModule, WorkflowModule],
  controllers: [CashSettlementController],
  providers: [
    CashSettlementService,
    CashSettlementRepository,
    CashSettlementBuilder,
    CashSettlementValidationService,
    CashSettlementCalculationService,
  ],
  exports: [CashSettlementService, CashSettlementValidationService],
})
export class CashSettlementModule {}
