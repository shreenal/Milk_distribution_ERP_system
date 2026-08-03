import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SupplyCategory,
  DeliverySession,
  PurchaseVarianceReason,
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
  purchasedQty!: number;
}

class PurchaseVarianceAcknowledgementDto {
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

  @IsEnum(PurchaseVarianceReason)
  reason!: PurchaseVarianceReason;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SavePurchaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseEntryDto)
  entries!: PurchaseEntryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseVarianceAcknowledgementDto)
  acknowledgements?: PurchaseVarianceAcknowledgementDto[];
}
