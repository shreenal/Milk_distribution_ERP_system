import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    UseGuards,
} from '@nestjs/common';

import { CashSettlementService }
    from './cash-settlement.service.js';

import {
    SaveRouteExpensesDto,
} from './dto/save-route-expense.dto.js';
import { SaveRouteDenominationsDto } from './dto/save-route-denominations.dto.js';

import {
    SaveDirectCollectionsDto,
} from './dto/save-direct-collections.dto.js';

import {
    SaveBankDepositsDto,
} from './dto/save-bank-deposit.dto.js';

import {
    JwtAuthGuard,
} from '../auth/auth.guard.js';

import {
    RolesGuard,
} from '../auth/roles.guard.js';

import {
    Roles,
} from '../auth/roles.decorator.js';

@Controller(
    'cash-settlement',
)
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
)
export class CashSettlementController {

    constructor(
        private readonly cashSettlementService:
            CashSettlementService,
    ) { }

    @Get(':paperId')
    @Roles('EMPLOYEE')
    async getCashSettlement(
        @Param(
            'paperId',
            ParseIntPipe,
        )
        paperId: number,
    ) {
        return this.cashSettlementService
            .getCashSettlementService(
                paperId,
            );
    }

    @Post(
        ':paperId/route-expenses',
    )
    @Roles('EMPLOYEE')
    async saveRouteExpenses(
        @Param(
            'paperId',
            ParseIntPipe,
        )
        paperId: number,

        @Body()
        dto: SaveRouteExpensesDto,
    ) {

        return this.cashSettlementService
            .saveRouteExpensesService(
                paperId,
                dto,
            );
    }

    @Post(
        ':paperId/route-denominations',
    )
    @Roles('EMPLOYEE')
    async saveRouteDenominations(

        @Param(
            'paperId',
            ParseIntPipe,
        )
        paperId: number,

        @Body()
        dto: SaveRouteDenominationsDto,
    ) {

        return this.cashSettlementService
            .saveRouteDenominationsService(
                paperId,
                dto,
            );
    }

    @Post(
        ':paperId/direct-collections',
    )
    @Roles('EMPLOYEE')
    async saveDirectCollections(

        @Param(
            'paperId',
            ParseIntPipe,
        )
        paperId: number,

        @Body()
        dto: SaveDirectCollectionsDto,
    ) {

        return this.cashSettlementService
            .saveDirectCollectionsService(
                paperId,
                dto,
            );
    }

    @Post(
        ':paperId/bank-deposits',
    )
    @Roles('EMPLOYEE')
    async saveBankDeposits(

        @Param(
            'paperId',
            ParseIntPipe,
        )
        paperId: number,

        @Body()
        dto: SaveBankDepositsDto,
    ) {

        return this.cashSettlementService
            .saveBankDepositsService(
                paperId,
                dto,
            );
    }
}