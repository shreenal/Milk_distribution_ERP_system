import {
    IsArray,
    IsInt,
    ValidateNested,
} from 'class-validator';

import {
    Type,
} from 'class-transformer';

class VehicleAllocationItemDto {

    @IsInt()
    groupId: number;

    @IsInt()
    vehicleId: number;
}

export class SaveVehicleAllocationDto {

    @IsArray()

    @ValidateNested({
        each: true,
    })

    @Type(
        () => VehicleAllocationItemDto,
    )

    allocations:
        VehicleAllocationItemDto[];
}