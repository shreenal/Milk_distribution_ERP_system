import {
  IsBoolean,
  IsInt,
  IsOptional,
} from 'class-validator';

export class CreateTrayRuleDto {
  @IsOptional()
  @IsInt()
  product_group_id?: number;

  @IsOptional()
  @IsInt()
  brand_id?: number;

  @IsOptional()
  @IsInt()
  product_type_id?: number;

  @IsOptional()
  @IsInt()
  packaging_type_id?: number;

  @IsInt()
  tray_type_id!: number;

  @IsOptional()
  @IsBoolean()
  applies_to_packaging?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}