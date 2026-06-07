import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';

import { SaveVehicleAllocationDto }
from './dto/save-vehicle-allocation.dto.js';

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


    @Post(
    ':paperId/group-allocations',
)
async saveGroupAllocations(

    @Param(
        'paperId',
        ParseIntPipe,
    )
    paperId: number,

    @Body()
    dto: SaveVehicleAllocationDto,
) {

    return this
        .vehicleCapacityService
        .saveGroupAllocations(
            paperId,
            dto,
        );
}

@Get(
    ':paperId/group-allocations',
)
async getGroupAllocations(

    @Param(
        'paperId',
        ParseIntPipe,
    )
    paperId: number,
) {

    return this
        .vehicleCapacityService
        .getGroupAllocations(
            paperId,
        );
}

@Get(
    'vehicle-summary/:paperId',
)
async getVehicleSummary(

    @Param(
        'paperId',
        ParseIntPipe,
    )
    paperId: number,
) {

    return this
        .vehicleCapacityService
        .getVehicleSummary(
            paperId,
        );
}
}