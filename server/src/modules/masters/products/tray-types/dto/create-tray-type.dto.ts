import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateTrayTypeDto {
  @Type(() => Number)
  @IsInt()
  brand_id!: number;

  @TrimmedName(50)
  color!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
