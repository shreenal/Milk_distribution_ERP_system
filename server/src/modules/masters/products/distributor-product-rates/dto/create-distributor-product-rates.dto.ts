import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateDistributorProductRatesDto {
  @IsInt()
  product_link_id!: number;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  purchase_rate!: number;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  selling_rate!: number;

  @IsOptional()
  @IsDateString()
  effective_from?: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}