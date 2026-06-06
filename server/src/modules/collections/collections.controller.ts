import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    UseGuards,
} from '@nestjs/common';

import { CollectionsService }
    from './collections.service.js';
import { SaveAdminCollectionsDto } from './dto/save-admin-collection.dto.js';
import { SaveNightCollectionsDto }
    from './dto/save-night-collection.dto.js';

import { SaveMorningCollectionsDto }
    from './dto/save-morning-collection.dto.js';

import { JwtAuthGuard }
from '../auth/auth.guard.js';

import { RolesGuard }
from '../auth/roles.guard.js';

import { Roles }
from '../auth/roles.decorator.js';




@Controller('collections')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
)
export class CollectionsController {

    constructor(

        private readonly collectionsService:
            CollectionsService,
    ) { }

    @Get(
        '/sheet/:sheetId',
    )

    @Roles('EMPLOYEE')
    getCollectionGrid(

        @Param(
            'sheetId',
            ParseIntPipe,
        )
        sheetId: number,
    ) {

        return this
            .collectionsService
            .getCollectionGrid(
                sheetId,
            );
    }


    @Post(
        '/sheet/:sheetId/night-save',
    )
    @Roles('EMPLOYEE')
    saveNightCollections(

        @Param(
            'sheetId',
            ParseIntPipe,
        )
        sheetId: number,

        @Body()
        dto: SaveNightCollectionsDto,
    ) {

        return this
            .collectionsService
            .saveNightCollections(
                sheetId,
                dto,
            );
    }


    @Post(
        '/sheet/:sheetId/morning-save',
    )

    @Roles('EMPLOYEE')
    saveMorningCollections(

        @Param(
            'sheetId',
            ParseIntPipe,
        )
        sheetId: number,

        @Body()
        dto: SaveMorningCollectionsDto,
    ) {

        return this
            .collectionsService
            .saveMorningCollections(
                sheetId,
                dto,
            );
    }



    @Post(
        '/sheet/:sheetId/admin-save',
    )
    @Roles('ADMIN')
    saveAdminCollections(

        @Param(
            'sheetId',
            ParseIntPipe,
        )
        sheetId: number,

        @Body()
        dto: SaveAdminCollectionsDto,
    ) {

        return this
            .collectionsService
            .saveAdminCollections(
                sheetId,
                dto,
            );
    }
}