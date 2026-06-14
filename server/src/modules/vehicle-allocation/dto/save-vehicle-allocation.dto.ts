import { Type } from 'class-transformer';

import { IsInt, IsNumber, IsArray, ValidateNested } from 'class-validator';

class VehicleAllocationItemDto {
  @IsInt()
  vehicleId!: number;

  @IsInt()
  productId!: number;

  @IsNumber()
  allocatedQty!: number;
}

class VehicleAssignmentItemDto {
  @IsInt()
  vehicleId!: number;

  @IsInt()
  distributorId!: number;
}

export class SaveVehicleAllocationDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => VehicleAllocationItemDto)
  allocations!: VehicleAllocationItemDto[];

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => VehicleAssignmentItemDto)
  assignments!: VehicleAssignmentItemDto[];
}
