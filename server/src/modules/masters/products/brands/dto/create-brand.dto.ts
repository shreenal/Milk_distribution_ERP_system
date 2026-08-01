import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GatepassDatePolicy } from '../../../../../generated/prisma/client.js';

export class CreateBrandDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsInt()
  dairy_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsEnum(GatepassDatePolicy)
  gatepass_date_policy?: GatepassDatePolicy;
}