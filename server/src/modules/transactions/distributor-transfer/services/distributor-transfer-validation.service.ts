import { BadRequestException, Injectable } from '@nestjs/common';
import { TransferSummaryBuilder } from '../../../../types/distributor-transfer.types.js';
import { DistributorTransferRepository } from '../distributor-transfer.repository.js';
import { DistributorTransferBuilder } from '../distributor-transfer.builder.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';

type DistributorTransferRule = {
  supplier_distributor_id: number;
  owner_distributor_id: number;
};

@Injectable()
export class DistributorTransferValidationService {
  constructor(
    private readonly repository: DistributorTransferRepository,
    private readonly builder: DistributorTransferBuilder,
  ) {}

  // PA-6.4 / PA-7.4 / PA-8.6: every supplier and owner pair without a rule is
  // reported, not only the first. One missing pair keeps the original message.
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

    const missing = new Set<string>();

    for (const summary of summaries) {
      const key = `${summary.supplierDistributor.id}_${summary.ownerDistributor.id}`;

      if (!transferRuleSet.has(key)) {
        missing.add(
          `Transfer rule not found for supplier ${summary.supplierDistributor.name} and owner ${summary.ownerDistributor.name}`,
        );
      }
    }

    if (missing.size === 0) return;

    const details = [...missing];

    throw new BadRequestException({
      message:
        details.length === 1
          ? details[0]
          : `Transfer rules not found for ${details.length} supplier and owner pairs`,
      details,
    });
  }

  async validateGenerationReadiness(paperId: number, db: PrismaOrTransaction) {
    const sourceItems = await this.repository.getTransferSourceItems(
      paperId,
      db,
    );

    const summaries = this.builder.buildTransferSummary(sourceItems);

    const transferRules = await this.repository.findTransferRules(db);

    this.validateTransferRules(summaries, transferRules);
  }
}
