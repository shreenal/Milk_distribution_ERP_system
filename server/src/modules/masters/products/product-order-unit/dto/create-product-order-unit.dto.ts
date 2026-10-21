import { Type } from 'class-transformer';

import { IsEnum, IsInt, IsNumber, Max, Min } from 'class-validator';

import { PricingUnit } from '../../../../../generated/prisma/client.js';

export class CreateProductOrderUnitDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order_unit_type_id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  units_per_order_unit!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(9999999.999)
  pricing_quantity!: number;

  @IsEnum(PricingUnit)
  pricing_unit!: PricingUnit;
}
