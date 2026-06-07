import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
} from '@nestjs/common';

import { VehicleCapacityService }
    from './vehicle-capacity.service.js';

@Controller(
    'vehicle-capacity',
)
export class VehicleCapacityController {

    constructor(

        private readonly vehicleCapacityService:
            VehicleCapacityService,
    ) { }

    @Get(
        'group-summary/:paperId',
    )
    async getGroupSummary(

        @Param(
            'paperId',
            ParseIntPipe,
        )
        paperId: number,
    ) {

        return this
            .vehicleCapacityService
            .getGroupSummary(
                paperId,
            );
    }
}