import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class CreateProductLinksDto {
  @IsInt()
  distributor_id!: number;

  @IsInt()
  product_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
