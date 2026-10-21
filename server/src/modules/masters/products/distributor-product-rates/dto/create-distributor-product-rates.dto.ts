import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class CreateDistributorProductRatesDto {
  @IsInt()
  product_link_id!: number;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  @Max(99999999.99)
  purchase_rate!: number;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  @Max(99999999.99)
  selling_rate!: number;

  @IsOptional()
  @IsDateString()
  effective_from?: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
