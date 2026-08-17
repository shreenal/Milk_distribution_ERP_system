import { Injectable } from '@nestjs/common';
import { DistributorTransferService } from '../../distributor-transfer/distributor-transfer.service.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';

@Injectable()
export class DistributorTransferPropagationService {
  constructor(
    private readonly distributorTransferService: DistributorTransferService,
  ) {}

  async propagate(paperId: number, db: PrismaOrTransaction): Promise<void> {
    await this.distributorTransferService.generateTransfer(paperId, db);
  }
}
