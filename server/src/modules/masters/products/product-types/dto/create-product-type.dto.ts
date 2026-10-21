import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateProductTypeDto {
  @Type(() => Number)
  @IsInt()
  brand_id!: number;

  @TrimmedName(100)
  name!: string;
}
