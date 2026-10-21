import { IsBoolean, IsInt, IsOptional } from 'class-validator';

/**
 * Scope fields are nullable: null means "any". PATCH can therefore widen a
 * rule back to "any" (undefined leaves the field unchanged).
 */
export class CreateTrayRuleDto {
  @IsOptional()
  @IsInt()
  product_group_id?: number | null;

  @IsOptional()
  @IsInt()
  brand_id?: number | null;

  @IsOptional()
  @IsInt()
  product_type_id?: number | null;

  @IsOptional()
  @IsInt()
  packaging_type_id?: number | null;

  @IsInt()
  tray_type_id!: number;

  @IsOptional()
  @IsBoolean()
  applies_to_packaging?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
