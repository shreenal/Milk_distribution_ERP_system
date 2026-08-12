import { BadRequestException, Injectable } from '@nestjs/common';
import { TransferSummaryBuilder } from '../../../../types/distributor-transfer.types.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { DistributorTransferRepository } from '../distributor-transfer.repository.js';
import { DistributorTransferBuilder } from '../distributor-transfer.builder.js';

type DistributorTransferRule = Prisma.distributor_transfer_ruleGetPayload<{}>;

@Injectable()
export class DistributorTransferValidationService {
  constructor(
    private readonly repository: DistributorTransferRepository,
    private readonly builder: DistributorTransferBuilder,
  ) {}
  validateTransferRules(
    summaries: TransferSummaryBuilder[],
    transferRules: DistributorTransferRule[],
  ) {
    const transferRuleSet = new Set(
      transferRules.map(
        (rule) =>
          `${rule.supplier_distributor_id}_${rule.owner_distributor_id}`,
      ),
    );

    for (const summary of summaries) {
      const key = `${summary.supplierDistributor.id}_${summary.ownerDistributor.id}`;

      if (!transferRuleSet.has(key)) {
        throw new BadRequestException(
          `Transfer rule not found for supplier ${summary.supplierDistributor.name} and owner ${summary.ownerDistributor.name}`,
        );
      }
    }
  }

  async validateGenerationReadiness(paperId: number) {
    const sourceItems = await this.repository.getTransferSourceItems(paperId);

    const summaries = this.builder.buildTransferSummary(sourceItems);

    const transferRules = await this.repository.findTransferRules();

    this.validateTransferRules(summaries, transferRules);
  }
}
