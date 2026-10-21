import {
  IsInt,
  IsNumber,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  SupplyCategory,
  DeliverySession,
} from '../../../../generated/prisma/client.js';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { PURCHASE_LIMITS } from '../purchase.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PurchaseEntryDto {
  // PD-2 / PD-60: bounded ids, so an oversized id is a 400, not a database overflow.
  @IsInt()
  @Min(1)
  @Max(PURCHASE_LIMITS.MAX_ID)
  vehicleId!: number;

  @IsEnum(DeliverySession)
  deliverySession!: DeliverySession;

  @IsInt()
  @Min(1)
  @Max(PURCHASE_LIMITS.MAX_ID)
  distributorId!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsInt()
  @Min(1)
  @Max(PURCHASE_LIMITS.MAX_ID)
  productId!: number;

  // PD-39: null / blank / omitted = untracked (no entry). Explicit 0 = a
  // confirmed zero purchase. The 2-decimal rule is applied in the service so a
  // legacy value echoed back unchanged is tolerated (PD-27).
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(PURCHASE_LIMITS.MAX_PURCHASED_QTY)
  purchasedQty?: number | null;

  // PD-4: the allocation the client saw. Required when the entry is already saved.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PURCHASE_LIMITS.MAX_ID)
  sourceAllocationId?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(PURCHASE_LIMITS.MAX_PURCHASED_QTY)
  sourceAllocatedQty?: number;
}

export class SavePurchaseDto {
  // An empty array is valid only when nothing is saved yet (PD-9).
  @IsArray()
  @ArrayMaxSize(PURCHASE_LIMITS.MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseEntryDto)
  entries!: PurchaseEntryDto[];

  // PD-12: required. Explicit null only before the first save.
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;

  // PD-5: ordinary deletion is explicit, by saved entry id.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PURCHASE_LIMITS.MAX_ENTRIES)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(PURCHASE_LIMITS.MAX_ID, { each: true })
  deletedEntryIds?: number[];

  // PD-10: bulk purge. ADMIN only, scope must be named.
  @IsOptional()
  @IsBoolean()
  purgeAll?: boolean;

  @IsOptional()
  @IsIn(['PAPER'])
  purgeScope?: 'PAPER';

  // PD-34: ADMIN only.
  @IsOptional()
  @IsBoolean()
  reevaluateTrays?: boolean;

  // PD-41: optional note explaining a critical shortfall (logged, not stored).
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  shortfallComment?: string;

  // Optional reason for purge / tray re-evaluation (logged).
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
