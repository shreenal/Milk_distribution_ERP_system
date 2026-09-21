import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DistributorTransferRepository } from './distributor-transfer.repository.js';
import { DistributorTransferBuilder } from './distributor-transfer.builder.js';
import { DistributorTransferValidationService } from './services/distributor-transfer-validation.service.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { DISTRIBUTOR_TRANSFER_ERRORS } from './distributor-transfer.constants.js';

@Injectable()
export class DistributorTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: DistributorTransferRepository,
    private readonly builder: DistributorTransferBuilder,
    private readonly validation: DistributorTransferValidationService,
    private readonly workflowState: WorkflowStateService,
  ) {}

  async getTransferSummary(paperId: number) {
    const paper = await this.repository.findOrderPaperById(paperId);

    if (!paper) {
      throw new NotFoundException(
        DISTRIBUTOR_TRANSFER_ERRORS.ORDER_PAPER_NOT_FOUND,
      );
    }

    const items = await this.repository.getTransferSourceItems(paperId);

    const summaries = this.builder.buildTransferSummary(items);

    const transfers = this.builder.buildTransferGrids(summaries);

    return {
      paper,
      ...transfers,
    };
  }

  async generateTransfer(paperId: number, db?: PrismaOrTransaction) {
    const run = async (tx: PrismaOrTransaction) => {
      const paper = await this.repository.findOrderPaperById(paperId, tx);

      if (!paper) {
        throw new NotFoundException(
          DISTRIBUTOR_TRANSFER_ERRORS.ORDER_PAPER_NOT_FOUND,
        );
      }

      if (
        !db &&
        !this.workflowState.canEditDistributorTransfers(paper.status)
      ) {
        throw new BadRequestException(
          DISTRIBUTOR_TRANSFER_ERRORS.GENERATE_NOT_ALLOWED,
        );
      }
      const sourceItems = await this.repository.getTransferSourceItems(
        paper.id,
        tx,
      );

      const summaries = this.builder.buildTransferSummary(sourceItems);

      const transferRules = await this.repository.findTransferRules(tx);

      this.validation.validateTransferRules(summaries, transferRules);

      const transfers = this.builder.buildTransferEntities(paper.id, summaries);

      await this.repository.replaceDistributorTransfers(
        paper.id,
        transfers,
        tx,
      );

      const grids = this.builder.buildTransferGrids(summaries);

      return {
        paper,
        ...grids,
      };
    };
    if (db) return run(db);
    return this.prisma.$transaction((tx) => run(tx));
  }
}
