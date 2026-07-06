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

import { SupplyCategory } from '../../generated/prisma/client.js';
import { CollectionsValidationService } from './collections-validation.service.js';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly collectionsRepository: CollectionsRepository,

    private readonly collectionBuilder: CollectionBuilder,

    private readonly collectionsValidationService: CollectionsValidationService,

    private readonly workflowState: WorkflowStateService,
  ) { }

  async getCollectionGrid(sheetId: number) {
    const sheet = await this.collectionsRepository.getOrderSheetById(sheetId);

    if (!sheet) {
      throw new BadRequestException(COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const milkClients =
      await this.collectionsRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        SupplyCategory.MILK,
      );

    const nonMilkClients =
      await this.collectionsRepository.getClientsByGroupAndCategory(
        sheet.group_id,
        SupplyCategory.NON_MILK,
      );

    const savedCollections =
      await this.collectionsRepository.getCollectionEntries(sheetId);

    return this.collectionBuilder.buildCollectionSection(
      sheet,
      milkClients,
      nonMilkClients,
      savedCollections,
    );
  }

  async saveNightCollections(sheetId: number, category: SupplyCategory, dto: SaveNightCollectionsDto) {
    const sheet = await this.collectionsRepository.getOrderSheetById(sheetId);

    if (!sheet) {
      throw new BadRequestException(COLLECTION_ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    const status = sheet.order_paper.status;

    if (!this.workflowState.canEditNightCollections(status)) {
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

    await this.collectionsRepository.replaceNightCollections(
      sheetId,
      category,
      dto.entries,
    );

    return {
      message: COLLECTION_SUCCESS_MESSAGES.NIGHT_SAVED,
    };
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

    const status = sheet.order_paper.status;

    if (!this.workflowState.canEditMorningCollections(status)) {
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

    await this.collectionsRepository.replaceMorningCollections(
      sheetId,
      category,
      dto.entries,
    );

    return {
      message: COLLECTION_SUCCESS_MESSAGES.MORNING_SAVED,
    };
  }

  async saveAdminCollections(
    sheetId: number,
    category: SupplyCategory,
    dto: SaveAdminCollectionsDto) {
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

    await this.collectionsRepository.replaceAdminCollections(
      sheetId,
      category,
      dto.entries,
    );

    return {
      message: COLLECTION_SUCCESS_MESSAGES.ADMIN_SAVED,
    };
  }
}
