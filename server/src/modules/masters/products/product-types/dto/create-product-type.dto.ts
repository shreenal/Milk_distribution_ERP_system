import { IsInt, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductTypeDto {
  @Type(() => Number)
  @IsInt()
  brand_id!: number;

  @IsString()
  @MaxLength(100)
  name!: string;
}
