import { Injectable, NotFoundException } from '@nestjs/common';

import { DistributorTransferRepository } from './distributor-transfer.repository.js';
import { DistributorTransferBuilder } from './distributor-transfer.builder.js';
import { DistributorTransferValidationService } from './distributor-transfer-validation.service.js';
import {
  TransferGrid,
  TransferSummaryBuilder,
} from 'src/types/distributor-transfer.types.js';
import { Prisma } from '../../generated/prisma/client.js';
@Injectable()
export class DistributorTransferService {
  constructor(
    private readonly repository: DistributorTransferRepository,
    private readonly builder: DistributorTransferBuilder,
    private readonly validation: DistributorTransferValidationService,
  ) {}

  async getTransferSummary(paperId: number) {
    const items = await this.repository.getTransferSourceItems(paperId);

    const summaries = this.builder.buildTransferSummary(items);

    return this.builder.buildTransferGrids(summaries);
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

    const transfers = this.buildTransferEntities(paper.id, summaries);

    await this.repository.replaceDistributorTransfers(paper.id, transfers);

    return this.builder.buildTransferGrids(summaries);
  }

  private buildTransferEntities(
    orderPaperId: number,
    summaries: TransferSummaryBuilder[],
  ): Prisma.distributor_transferCreateManyInput[] {
    const transfers: Prisma.distributor_transferCreateManyInput[] = [];

    for (const summary of summaries) {
      for (const row of summary.rows) {
        for (const [field, value] of Object.entries(row)) {
          if (field === 'billingGroupId' || field === 'billingGroupName') {
            continue;
          }

          if (!field.startsWith('product_')) {
            continue;
          }

          const qty = Number(value ?? 0);

          if (qty <= 0) {
            continue;
          }

          const productId = Number(field.replace('product_', ''));

          transfers.push({
            order_paper_id: orderPaperId,
            supplier_distributor_id: summary.supplierDistributorId,
            owner_distributor_id: summary.ownerDistributorId,
            billing_group_id: row.billingGroupId,
            product_id: productId,
            transfer_qty: qty,
          });
        }
      }
    }

    return transfers;
  }
}
