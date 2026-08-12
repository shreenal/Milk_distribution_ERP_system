import { Injectable } from '@nestjs/common';
import { DistributorTransferService } from '../../distributor-transfer/distributor-transfer.service.js';

@Injectable()
export class DistributorTransferPropagationService {
  constructor(
    private readonly distributorTransferService: DistributorTransferService,
  ) {}

  async propagate(paperId: number): Promise<void> {
    await this.distributorTransferService.generateTransfer(paperId);
  }
}
