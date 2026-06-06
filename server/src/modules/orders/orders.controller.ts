import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';

import { OrdersService } from './orders.service.js';

import { JwtAuthGuard }
from '../auth/auth.guard.js';

import { RolesGuard }
from '../auth/roles.guard.js';

import { Roles }
from '../auth/roles.decorator.js';


@Controller('orders')

@UseGuards(
    JwtAuthGuard,
    RolesGuard,
)
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
    ) { }

    @Get('today-paper')
    @Roles('EMPLOYEE')

    async getTodayPaper() {

        return this.ordersService
            .getTodayPaperService();
    }


    @Post('generate-order-paper')
    @Roles('EMPLOYEE')
async generateOrderPaper(
    @Body('date')
    date: string,
) {

    return this.ordersService
        .generateOrderPaperService(
            date,
        );
}

    @Get('sheet/:sheetId')
    @Roles('EMPLOYEE')
    async getSheet(
        @Param('sheetId') sheetId: string,
    ) {

        return this.ordersService
            .getSheetService(
                Number(sheetId),
            );
    }

    @Get('sheet/:sheetId/items')
    @Roles('EMPLOYEE')
    async getSheetItems(
        @Param('sheetId')
        sheetId: string,
    ) {

        return this.ordersService
            .getSheetItemsService(
                Number(sheetId),
            );
    }


    @Post('sheet/:sheetId/night-save')
    @Roles('EMPLOYEE')
    async saveNightEntries(
        @Param('sheetId') sheetId: string,
        @Body() entries: any[],
    ) {
        try {
            return await this.ordersService
                .saveNightEntriesService(
                    Number(sheetId),
                    entries,
                );
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Failed to save night entries'
            );
        }
    }


    @Post('sheet/:sheetId/morning-save')
    @Roles('EMPLOYEE')
    async saveMorningEntries(

        @Param('sheetId')
        sheetId: string,

        @Body()
        entries: any[],
    ) {

        return this.ordersService
            .saveMorningEntriesService(

                Number(sheetId),

                entries,
            );
    }


    @Post('paper/:paperId/night-submit')
    @Roles('EMPLOYEE')
    async submitNightEntry(
        @Param('paperId')
        paperId: string,
    ) {

        return this.ordersService
            .submitNightEntryService(
                Number(paperId),
            );
    }


    @Post('paper/:paperId/morning-submit')
    @Roles('EMPLOYEE')
    async submitMorningEntry(

        @Param('paperId')
        paperId: string,
    ) {

        return this.ordersService
            .submitMorningEntryService(

                Number(paperId),
            );
    }


    @Post('paper/:paperId/finalize')
    @Roles('ADMIN')
    async finalizePaper(

        @Param('paperId')
        paperId: string,
    ) {

        return this.ordersService
            .finalizePaperService(

                Number(paperId),
            );
    }



    @Post('paper/:paperId/reopen')
    @Roles('ADMIN')
    async reopenPaper(

        @Param('paperId')
        paperId: string,
        @Body('reason')
        reason: string,
    ) {

        return this.ordersService
            .reopenPaperService(

                Number(paperId),
                String(reason),
            );
    }
}