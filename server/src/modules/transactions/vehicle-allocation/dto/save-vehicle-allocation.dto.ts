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
  // FIX F11 (consistency review): Orders bounds ordered quantity to 10000
  // (see orders.constants.ts QUANTITY_PRECISION.MAX_ORDERED_QTY) but
  // Vehicle Allocation and Purchase quantities had no upper bound at all.
  // Same numeric policy applied here for consistency across the three
  // modules that write a "quantity of product" value.
  @Max(10000)
  allocatedQty!: number;
}

export class SaveVehicleAllocationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleAllocationItemDto)
  allocations!: VehicleAllocationItemDto[];

  /**
   * FIX F12 (consistency review): GET requires an explicit `session` query
   * param but POST previously inferred it silently from paper status with
   * no way to catch a mismatch. The client now states which session it
   * believes it's saving; the service (see VehicleAllocationService)
   * validates this against the server-computed active session.
   */
  @IsEnum(DeliverySession)
  session!: DeliverySession;

  /**
   * FIX F6: the vehicle_allocation_paper.updated_at the client last read
   * (from `vehicleAllocationPaperUpdatedAt` in the GET response). If it no
   * longer matches the server's value, the save is rejected (409) instead
   * of blindly overwriting a concurrent edit. Optional for rollout safety.
   */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  /**
   * FIX F3 (consistency review): mirrors SavePurchaseDto.confirmDeletions.
   * If the save would remove previously-saved allocation rows that aren't
   * present in `allocations`, the service rejects the save with a list of
   * what would be dropped unless this flag is explicitly set to true.
   */
  @IsOptional()
  @IsBoolean()
  confirmDeletions?: boolean;
}
