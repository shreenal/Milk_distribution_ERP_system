import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsISO8601,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import {
  DeliverySession,
  SupplyCategory,
} from '../../../../generated/prisma/client.js';

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
  @Max(10000)
  allocatedQty!: number;
}

export class SaveVehicleAllocationDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => VehicleAllocationItemDto)
  allocations!: VehicleAllocationItemDto[];
  @IsEnum(DeliverySession)
  session!: DeliverySession;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  @IsOptional()
  @IsBoolean()
  confirmDeletions?: boolean;
}
