import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
} from 'class-validator';

import { SupplyCategory } from '../../../../../generated/prisma/client.js';

export class CreateGroupSupplyRuleDto {
  @IsInt()
  group_id!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsInt()
  distributor_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}