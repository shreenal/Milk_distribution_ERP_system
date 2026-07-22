import { Injectable, BadRequestException } from '@nestjs/common';
import { CollectionsRepository } from './collections.repository.js';
import { COLLECTION_ERROR_MESSAGES } from './collections.constants.js';
import { SupplyCategory } from '../../generated/prisma/client.js';

@Injectable()
export class CollectionsValidationService {
  constructor(private readonly collectionsRepository: CollectionsRepository) {}

  validateClientsForCategory(
    entries: { clientId: number }[],
    validClients: { id: number }[],
    category: SupplyCategory,
  ) {
    const validClientIds = new Set(validClients.map((client) => client.id));

    for (const entry of entries) {
      if (!validClientIds.has(entry.clientId)) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.CLIENT_NOT_IN_CATEGORY(
            entry.clientId,
            category,
          ),
        );
      }
    }
  }

  async validateNightCollections(sheetId: number): Promise<void> {
    const collections =
      await this.collectionsRepository.getCollectionsForValidation(sheetId);

    for (const row of collections) {
      if (Number(row.office_amount_given ?? 0) < 0) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.NEGATIVE_OFFICE_AMOUNT,
        );
      }
    }
  }

  async validateMorningCollections(sheetId: number): Promise<void> {
    const collections =
      await this.collectionsRepository.getCollectionsForValidation(sheetId);

    for (const row of collections) {
      if (Number(row.cash_collection ?? 0) < 0) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.NEGATIVE_CASH_COLLECTION,
        );
      }

      if (Number(row.cheque_collection ?? 0) < 0) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.NEGATIVE_CHEQUE_COLLECTION,
        );
      }
    }
  }

  async validateAdminCollections(sheetId: number): Promise<void> {
    const collections =
      await this.collectionsRepository.getCollectionsForValidation(sheetId);

    for (const row of collections) {
      if (Number(row.online_collection ?? 0) < 0) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.NEGATIVE_ONLINE_COLLECTION,
        );
      }

      if (Number(row.bank_deposit ?? 0) < 0) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.NEGATIVE_BANK_DEPOSIT,
        );
      }
    }
  }
}
