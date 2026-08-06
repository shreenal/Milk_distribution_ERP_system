import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MAX_GST_PERCENTAGE } from '../products.constants.js';

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  brand_id!: number;

  @Type(() => Number)
  @IsInt()
  product_group_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  product_type_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packaging_type_id?: number | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  packaging_size!: number;

  @IsString()
  @MaxLength(20)
  packaging_unit!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_GST_PERCENTAGE)
  gst_percentage?: number;

  @IsOptional()
  @IsBoolean()
  is_gst_inclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
