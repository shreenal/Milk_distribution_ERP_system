import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateClientDto {
  @TrimmedName(100)
  name!: string;

  // null clears the value on update (PartialType keeps undefined = unchanged).
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shop_name?: string | null;

  @IsInt()
  delivery_group_id!: number;

  @IsInt()
  owner_distributor_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}