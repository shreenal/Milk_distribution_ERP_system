import {
    Injectable,
    BadRequestException,
} from '@nestjs/common';

import { CollectionBuilder }
    from './collections.builder.js';

import { CollectionsRepository }
    from './collections.repository.js';


import { SaveAdminCollectionsDto }
from './dto/save-admin-collection.dto.js';

import { SaveNightCollectionsDto }
from './dto/save-night-collection.dto.js';

import { SaveMorningCollectionsDto }
from './dto/save-morning-collection.dto.js';

import { WorkflowStateService }
from '../workflow/workflow-state.service.js';

@Injectable()
export class CollectionsService {

    constructor(

        private readonly collectionsRepository:
            CollectionsRepository,

        private readonly collectionBuilder:
            CollectionBuilder,

        private readonly workflowState: WorkflowStateService,
    ) { }

    async getCollectionGrid(
        sheetId: number,
    ) {

        const sheet =
            await this
                .collectionsRepository
                .getOrderSheetById(
                    sheetId,
                );

        if (!sheet) {

            throw new BadRequestException(
                'Order sheet not found',
            );
        }

        const clients =
            await this
                .collectionsRepository
                .getClientsByGroupId(
                    sheet.group_id,
                );

        const savedCollections =
            await this
                .collectionsRepository
                .getCollectionEntries(
                    sheetId,
                );

        return this
            .collectionBuilder
            .buildCollectionGrid(

                sheet,

                clients,

                savedCollections,
            );
    }


async saveNightCollections(
    sheetId: number,
    dto: SaveNightCollectionsDto,
) {

    const sheet =
        await this.collectionsRepository
            .getOrderSheetById(sheetId);

    if (!sheet) {
        throw new BadRequestException(
            'Order sheet not found',
        );
    }

    const status =
        sheet.order_paper.status;

    if (status !== 'DRAFT') {
        throw new BadRequestException(
            'Night collections can only be edited in DRAFT status',
        );
    }

    for (const entry of dto.entries) {

        await this.collectionsRepository
            .upsertNightCollectionEntry(
                sheetId,
                entry,
            );
    }

    return {
        message:
            'Night collections saved successfully',
    };
}


async saveMorningCollections(
    sheetId: number,
    dto: SaveMorningCollectionsDto,
) {

    const sheet =
        await this.collectionsRepository
            .getOrderSheetById(sheetId);

    if (!sheet) {
        throw new BadRequestException(
            'Order sheet not found',
        );
    }

    const status =
        sheet.order_paper.status;

    if (
        status !== 'NIGHT_SUBMITTED'
    ) {
        throw new BadRequestException(
            'Morning collections can only be edited after night submission',
        );
    }

    for (const entry of dto.entries) {

        await this.collectionsRepository
            .upsertMorningCollectionEntry(
                sheetId,
                entry,
            );
    }

    return {
        message:
            'Morning collections saved successfully',
    };
}


async saveAdminCollections(
    sheetId: number,
    dto: SaveAdminCollectionsDto,
) {

    const sheet =
        await this.collectionsRepository
            .getOrderSheetById(
                sheetId,
            );

    if (!sheet) {
        throw new BadRequestException(
            'Order sheet not found',
        );
    }

    const status =
    sheet.order_paper.status;

if (
    !this.workflowState
        .canAdminEditCollections(
            status as any,
        )
) {
    throw new BadRequestException(
        'Admin collections cannot be edited in current workflow state',
    );
}

    for (const entry of dto.entries) {

        await this.collectionsRepository
            .upsertAdminCollectionEntry(
                sheetId,
                entry,
            );
    }

    return {
        message:
            'Admin collections saved successfully',
    };
}
}