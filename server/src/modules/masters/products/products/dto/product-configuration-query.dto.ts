import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class ProductConfigurationQueryDto {
  @IsOptional()
  @IsDateString()
  asOf?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;
}
