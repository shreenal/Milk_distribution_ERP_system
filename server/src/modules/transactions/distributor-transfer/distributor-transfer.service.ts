import {
  BadRequestException,
  ConflictException,
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
import { assertNotStale } from '../../../common/prisma/optimistic-concurrency.util.js';

const STALE_DATA_MESSAGE =
  'distributor transfer data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export interface GenerateTransferOptions {
  tx?: PrismaOrTransaction;
  skipAuthorization?: boolean;
  expectedUpdatedAt?: string;
}

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

  async generateTransfer(
    paperId: number,
    options: GenerateTransferOptions = {},
  ) {
    const { tx, skipAuthorization = false, expectedUpdatedAt } = options;

    const run = async (t: PrismaOrTransaction) => {
      const paper = await this.repository.findOrderPaperById(paperId, t);

      if (!paper) {
        throw new NotFoundException(
          DISTRIBUTOR_TRANSFER_ERRORS.ORDER_PAPER_NOT_FOUND,
        );
      }

      if (
        !skipAuthorization &&
        !this.workflowState.canEditDistributorTransfers(paper.status)
      ) {
        throw new BadRequestException(
          DISTRIBUTOR_TRANSFER_ERRORS.GENERATE_NOT_ALLOWED,
        );
      }

      if (!skipAuthorization && expectedUpdatedAt) {
        if (
          new Date(expectedUpdatedAt).getTime() !== paper.updated_at.getTime()
        ) {
          throw new ConflictException(STALE_DATA_MESSAGE);
        }
        await assertNotStale(
          () =>
            this.repository.touchOrderPaperIfUnchanged(
              paperId,
              new Date(expectedUpdatedAt),
              t,
            ),
          STALE_DATA_MESSAGE,
        );
      }

      const sourceItems = await this.repository.getTransferSourceItems(
        paper.id,
        t,
      );

      const summaries = this.builder.buildTransferSummary(sourceItems);

      const transferRules = await this.repository.findTransferRules(t);

      this.validation.validateTransferRules(summaries, transferRules);

      const transfers = this.builder.buildTransferEntities(paper.id, summaries);

      await this.repository.replaceDistributorTransfers(paper.id, transfers, t);

      const grids = this.builder.buildTransferGrids(summaries);

      return {
        paper,
        ...grids,
      };
    };

    if (tx) return run(tx);
    return this.prisma.$transaction((t) => run(t));
  }
}
