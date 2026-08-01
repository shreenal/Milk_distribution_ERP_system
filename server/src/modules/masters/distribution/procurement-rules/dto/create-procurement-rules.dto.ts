import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
} from 'class-validator';

import { SupplyCategory } from '../../../../../generated/prisma/client.js';

export class CreateProcurementRuleDto {
  @IsInt()
  distributor_id!: number;

  @IsInt()
  brand_id!: number;

  @IsInt()
  product_group_id!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}