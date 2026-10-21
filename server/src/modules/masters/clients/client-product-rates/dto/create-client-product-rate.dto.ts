import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsNumber,
  Max,
  Min,
} from 'class-validator';

export class CreateClientProductRateDto {
  @IsInt()
  client_id!: number;

  @IsInt()
  product_link_id!: number;

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
