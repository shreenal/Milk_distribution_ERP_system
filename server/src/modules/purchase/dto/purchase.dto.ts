import { IsArray, IsInt, IsNumber, ValidateNested } from 'class-validator';

import { Type } from 'class-transformer';

class PurchaseEntryDto {
  @IsInt()
  distributorId!: number;

  @IsInt()
  vehicleId!: number;

  @IsInt()
  productId!: number;

  @IsNumber()
  purchasedQty!: number;
}

export class SavePurchaseDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => PurchaseEntryDto)
  entries!: PurchaseEntryDto[];
}
