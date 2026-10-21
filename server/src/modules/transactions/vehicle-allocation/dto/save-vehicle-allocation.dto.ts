import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateBy,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DeliverySession,
  SupplyCategory,
} from '../../../../generated/prisma/client.js';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { VEHICLE_ALLOCATION_LIMITS } from '../vehicle-allocation.constants.js';
import { toDecimal } from '../../../../common/utils/money.util.js';

class VehicleAllocationItemDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  vehicleId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  distributorId!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId!: number;

  // VA-4.1: blank ("") and null mean 0 (the cell is cleared). Strings such as
  // "5", NaN, Infinity, negatives and more than 2 decimal places are rejected,
  // never rounded.
  @Transform(({ value }) => (value === '' || value === null ? 0 : value))
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    {
      message: `allocatedQty must be a number with at most ${VEHICLE_ALLOCATION_LIMITS.QTY_DECIMAL_PLACES} decimal places`,
    },
  )
  @ValidateBy({
    name: 'allocatedQtyDecimals',
    validator: {
      validate: (value: unknown) =>
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        toDecimal(value).decimalPlaces() <=
          VEHICLE_ALLOCATION_LIMITS.QTY_DECIMAL_PLACES,
      defaultMessage: () =>
        `allocatedQty must be a number with at most ${VEHICLE_ALLOCATION_LIMITS.QTY_DECIMAL_PLACES} decimal places`,
    },
  })
  @Min(0)
  @Max(VEHICLE_ALLOCATION_LIMITS.MAX_ALLOCATED_QTY)
  allocatedQty!: number;
}

export class SaveVehicleAllocationDto {
  // Full snapshot (VA-5.1). An empty array is valid (VA-5.13).
  @IsArray()
  @ArrayMaxSize(VEHICLE_ALLOCATION_LIMITS.MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => VehicleAllocationItemDto)
  allocations!: VehicleAllocationItemDto[];

  @IsEnum(DeliverySession)
  session!: DeliverySession;

  // VA-9.2: mandatory. Only an explicit null is allowed, and only while no
  // allocation exists yet for this paper and session (no @IsOptional()).
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;

  @IsOptional()
  @IsBoolean()
  confirmDeletions?: boolean;
}
