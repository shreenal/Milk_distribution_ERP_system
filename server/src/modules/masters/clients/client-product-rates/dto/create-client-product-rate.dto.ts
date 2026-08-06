import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateClientProductRateDto {
  @IsInt()
  client_id!: number;

  @IsInt()
  product_link_id!: number;

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
