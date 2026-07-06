import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { SupplyCategory } from '../../../generated/prisma/client.js';

class VehicleAllocationItemDto {
  @IsInt()
  vehicleId!: number;

  @IsInt()
  distributorId!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsInt()
  productId!: number;

  @IsNumber()
  allocatedQty!: number;
}

class VehicleAssignmentItemDto {
  @IsInt()
  vehicleId!: number;

  @IsOptional()
  @IsInt()
  milkDistributorId?: number | null;

  @IsOptional()
  @IsInt()
  nonMilkDistributorId?: number | null;
}

export class SaveVehicleAllocationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleAllocationItemDto)
  allocations!: VehicleAllocationItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleAssignmentItemDto)
  assignments!: VehicleAssignmentItemDto[];
}
