import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTrayTypeDto {
  @Type(() => Number)
  @IsInt()
  brand_id!: number;

  @IsString()
  @MaxLength(50)
  color!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}