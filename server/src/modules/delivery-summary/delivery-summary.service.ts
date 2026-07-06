import { Injectable, BadRequestException } from '@nestjs/common';

import { DeliverySummaryRepository } from './delivery-summary.repository.js';

import { DeliverySummaryBuilder } from './delivery-summary.builder.js';
import { DELIVERY_SUMMARY_ERROR_MESSAGES } from './delivery-summary.constants.js';

@Injectable()
export class DeliverySummaryService {
  constructor(
    private readonly deliverySummaryRepository: DeliverySummaryRepository,

    private readonly deliverySummaryBuilder: DeliverySummaryBuilder,
  ) { }

  async getBillingGroupSummary(paperId: number) {
    const paper =
      await this.deliverySummaryRepository.findOrderPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(
        DELIVERY_SUMMARY_ERROR_MESSAGES.ORDER_PAPER_NOT_FOUND,
      );
    }

    const deliveredItems =
      await this.deliverySummaryRepository.findDeliveredItemsWithSupplyContextByPaperId(
        paperId,
      );

    return this.deliverySummaryBuilder.buildBillingGroupSummary(
      deliveredItems,
    );
  }
}
