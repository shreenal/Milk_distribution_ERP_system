import { Injectable, NotFoundException } from '@nestjs/common';

import { DistributorTransferRepository } from './distributor-transfer.repository.js';
import { DistributorTransferBuilder } from './distributor-transfer.builder.js';
import { DistributorTransferValidationService } from './services/distributor-transfer-validation.service.js';
import { TransferGrid } from 'src/types/distributor-transfer.types.js';

@Injectable()
export class DistributorTransferService {
  constructor(
    private readonly repository: DistributorTransferRepository,
    private readonly builder: DistributorTransferBuilder,
    private readonly validation: DistributorTransferValidationService,
  ) {}

  async getTransferSummary(paperId: number) {
    const paper = await this.repository.findOrderPaperById(paperId);

    if (!paper) {
      throw new NotFoundException('Order paper not found');
    }

    const items = await this.repository.getTransferSourceItems(paperId);

    const summaries = this.builder.buildTransferSummary(items);

    const transfers = this.builder.buildTransferGrids(summaries);

    return {
      paper,
      ...transfers,
    };
  }

  async generateTransfer(paperId: number) {
    const paper = await this.repository.findOrderPaperById(paperId);

    if (!paper) {
      throw new NotFoundException('Order paper not found');
    }

    const sourceItems = await this.repository.getTransferSourceItems(paper.id);

    const summaries = this.builder.buildTransferSummary(sourceItems);

    const transferRules = await this.repository.findTransferRules();

    this.validation.validateTransferRules(summaries, transferRules);

    const transfers = this.builder.buildTransferEntities(paper.id, summaries);

    await this.repository.replaceDistributorTransfers(paper.id, transfers);

    const grids = this.builder.buildTransferGrids(summaries);

    return {
      paper,
      ...grids,
    };
  }
}
