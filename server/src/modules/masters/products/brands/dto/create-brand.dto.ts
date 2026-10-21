import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { GatepassDatePolicy } from '../../../../../generated/prisma/client.js';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateBrandDto {
  @TrimmedName(100)
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
