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

const STALE_DATA_MESSAGE =
  'distributor transfer data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export interface GenerateTransferOptions {
  tx?: PrismaOrTransaction;
  skipAuthorization?: boolean;
  // Required whenever skipAuthorization is false (the manual endpoint).
  expectedUpdatedAt?: string | null;
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
      distributorTransferUpdatedAt: paper.updated_at.toISOString(),
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

      // Manual generation: the token is mandatory. Omitted is 400, malformed
      // is 400, explicit null or a mismatch is 409. The internal finalize path
      // (skipAuthorization) does not use it.
      let newToken: Date | undefined;
      if (!skipAuthorization) {
        if (expectedUpdatedAt === undefined) {
          throw new BadRequestException('expectedUpdatedAt is required');
        }
        if (expectedUpdatedAt === null) {
          throw new ConflictException(STALE_DATA_MESSAGE);
        }
        const expected = new Date(expectedUpdatedAt);
        if (Number.isNaN(expected.getTime())) {
          throw new BadRequestException('Invalid expectedUpdatedAt');
        }
        const touch = await this.repository.touchOrderPaperIfTokenMatches(
          paperId,
          expected,
          t,
        );
        if (touch.count !== 1) {
          throw new ConflictException(STALE_DATA_MESSAGE);
        }
        newToken = touch.touchedAt;
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
        // The paper row was read before the token advanced; report the new one.
        paper: newToken ? { ...paper, updated_at: newToken } : paper,
        distributorTransferUpdatedAt: (
          newToken ?? paper.updated_at
        ).toISOString(),
        ...grids,
      };
    };

    if (tx) return run(tx);
    return this.prisma.$transaction((t) => run(t));
  }
}
