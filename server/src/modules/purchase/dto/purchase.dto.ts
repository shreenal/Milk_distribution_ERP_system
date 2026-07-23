import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SupplyCategory,
  DeliverySession,
} from '../../../generated/prisma/client.js';

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

export class SavePurchaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseEntryDto)
  entries!: PurchaseEntryDto[];
}
