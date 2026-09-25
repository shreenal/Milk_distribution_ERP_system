import {
  IsInt,
  IsNumber,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SupplyCategory,
  DeliverySession,
} from '../../../../generated/prisma/client.js';

class PurchaseEntryDto {
  @IsInt()
  vehicleId!: number;

  @IsEnum(DeliverySession)
  deliverySession!: DeliverySession;

  @IsInt()
  distributorId!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsInt()
  productId!: number;

  @IsNumber()
  @Min(0)
  // FIX F11 (consistency review): matches the same bound now applied to
  // Vehicle Allocation's allocatedQty and Orders' orderedQty/deliveredQty
  // (see orders.constants.ts QUANTITY_PRECISION.MAX_ORDERED_QTY).
  @Max(10000)
  purchasedQty!: number;
}

export class SavePurchaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseEntryDto)
  entries!: PurchaseEntryDto[];
  /**
   * FIX F6: the `purchase_paper.updated_at` the client last read. If the
   * server's current value doesn't match, the save is rejected (409) rather
   * than silently overwriting whatever changed underneath the client.
   * Optional so this can be rolled out without breaking older clients
   * immediately — but the service should log/warn when it's absent so you
   * can track migration of every frontend call site.
   */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  /**
   * FIX F5: if the save would delete existing purchase_entry rows that
   * aren't present in `entries` (because they no longer map onto a valid
   * grid row), the service rejects the save with a list of what would be
   * deleted UNLESS this flag is explicitly set to true. This turns a
   * silent, filter-driven deletion into an explicit, confirmed one.
   */
  @IsOptional()
  @IsBoolean()
  confirmDeletions?: boolean;
}
