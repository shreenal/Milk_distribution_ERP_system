import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsISO8601,
  Min,
} from 'class-validator';
import { SupplyCategory } from '../../../../generated/prisma/client.js';

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
  @Min(0)
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

  /**
   * FIX F6: the vehicle_allocation_paper.updated_at the client last read
   * (from `vehicleAllocationPaperUpdatedAt` in the GET response). If it no
   * longer matches the server's value, the save is rejected (409) instead
   * of blindly overwriting a concurrent edit. Optional for rollout safety.
   */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
