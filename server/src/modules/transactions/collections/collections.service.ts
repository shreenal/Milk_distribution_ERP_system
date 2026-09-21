import { Injectable, BadRequestException } from '@nestjs/common';

import { CollectionBuilder } from './collections.builder.js';
import { CollectionsRepository } from './collections.repository.js';

import { SaveAdminCollectionsDto } from './dto/save-admin-collection.dto.js';
import { SaveNightCollectionsDto } from './dto/save-night-collection.dto.js';
import { SaveMorningCollectionsDto } from './dto/save-morning-collection.dto.js';

import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import {
  COLLECTION_ERROR_MESSAGES,
  COLLECTION_SUCCESS_MESSAGES,
} from './collections.constants.js';

import { SupplyCategory } from '../../../generated/prisma/client.js';
import { CollectionsValidationService } from './services/collections-validation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly collectionsRepository: CollectionsRepository,
    private readonly collectionBuilder: CollectionBuilder,
    private readonly collectionsValidationService: CollectionsValidationService,
    private readonly workflowState: WorkflowStateService,
    private readonly prisma: PrismaService,
  ) {}

  async getCollectionGrid(sheetId: number) {
    return this.prisma.$transaction(async (tx) => {
      const sheet = await this.collectionsRepository.getOrderSheetById(
        sheetId,
        tx,
      );
      if (!sheet) {
        throw new BadRequestException(
          COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND,
        );
      }

      const [milkClients, nonMilkClients, savedCollections] = await Promise.all(
        [
          this.collectionsRepository.getClientsForCollectionDisplay(
            sheetId,
            sheet.group_id,
            SupplyCategory.MILK,
            tx,
          ),
          this.collectionsRepository.getClientsForCollectionDisplay(
            sheetId,
            sheet.group_id,
            SupplyCategory.NON_MILK,
            tx,
          ),
          this.collectionsRepository.getCollectionEntries(sheetId, tx),
        ],
      );

      return this.collectionBuilder.buildCollectionSection(
        sheet,
        milkClients,
        nonMilkClients,
        savedCollections,
      );
    });
  }

  async saveNightCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveNightCollectionsDto,
  ) {
    const sheet = await this.collectionsRepository.getOrderSheetById(sheetId);
    if (!sheet) {
      throw new BadRequestException(COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    if (!this.workflowState.canEditNightCollections(sheet.order_paper.status)) {
      throw new BadRequestException(
        COLLECTION_ERROR_MESSAGES.NIGHT_EDIT_NOT_ALLOWED,
      );
    }

    const validClients =
      await this.collectionsRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        category,
      );

    this.collectionsValidationService.validateClientsForCategory(
      dto.entries,
      validClients,
      category,
    );

    this.collectionsValidationService.validateNoDuplicateClients(dto.entries);

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const currentSheet =
            await this.collectionsRepository.getOrderSheetById(sheetId, tx);
          if (!currentSheet) {
            throw new BadRequestException(
              COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND,
            );
          }
          if (
            !this.workflowState.canEditNightCollections(
              currentSheet.order_paper.status,
            )
          ) {
            throw new BadRequestException(
              COLLECTION_ERROR_MESSAGES.NIGHT_EDIT_NOT_ALLOWED,
            );
          }

          await this.collectionsRepository.replaceNightCollections(
            sheetId,
            category,
            dto.entries,
            tx,
          );

          return { message: COLLECTION_SUCCESS_MESSAGES.NIGHT_SAVED };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  async saveMorningCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveMorningCollectionsDto,
  ) {
    const sheet = await this.collectionsRepository.getOrderSheetById(sheetId);
    if (!sheet) {
      throw new BadRequestException(COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    if (
      !this.workflowState.canEditMorningCollections(sheet.order_paper.status)
    ) {
      throw new BadRequestException(
        COLLECTION_ERROR_MESSAGES.MORNING_EDIT_NOT_ALLOWED,
      );
    }

    const validClients =
      await this.collectionsRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        category,
      );

    this.collectionsValidationService.validateClientsForCategory(
      dto.entries,
      validClients,
      category,
    );

    this.collectionsValidationService.validateNoDuplicateClients(dto.entries);

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const currentSheet =
            await this.collectionsRepository.getOrderSheetById(sheetId, tx);
          if (!currentSheet) {
            throw new BadRequestException(
              COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND,
            );
          }
          if (
            !this.workflowState.canEditMorningCollections(
              currentSheet.order_paper.status,
            )
          ) {
            throw new BadRequestException(
              COLLECTION_ERROR_MESSAGES.MORNING_EDIT_NOT_ALLOWED,
            );
          }

          await this.collectionsRepository.replaceMorningCollections(
            sheetId,
            category,
            dto.entries,
            tx,
          );

          return { message: COLLECTION_SUCCESS_MESSAGES.MORNING_SAVED };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }

  async saveAdminCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveAdminCollectionsDto,
  ) {
    const sheet = await this.collectionsRepository.getOrderSheetById(sheetId);
    if (!sheet) {
      throw new BadRequestException(COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const status = sheet.order_paper.status;
    if (!this.workflowState.canAdminEditCollections(status)) {
      throw new BadRequestException(
        COLLECTION_ERROR_MESSAGES.ADMIN_EDIT_NOT_ALLOWED,
      );
    }

    const validClients =
      await this.collectionsRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        category,
      );

    this.collectionsValidationService.validateClientsForCategory(
      dto.entries,
      validClients,
      category,
    );

    this.collectionsValidationService.validateNoDuplicateClients(dto.entries);

    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const currentSheet =
            await this.collectionsRepository.getOrderSheetById(sheetId, tx);
          if (!currentSheet) {
            throw new BadRequestException(
              COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND,
            );
          }
          if (
            !this.workflowState.canAdminEditCollections(
              currentSheet.order_paper.status,
            )
          ) {
            throw new BadRequestException(
              COLLECTION_ERROR_MESSAGES.ADMIN_EDIT_NOT_ALLOWED,
            );
          }

          await this.collectionsRepository.replaceAdminCollections(
            sheetId,
            category,
            dto.entries,
            tx,
          );

          return { message: COLLECTION_SUCCESS_MESSAGES.ADMIN_SAVED };
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );
  }
}
