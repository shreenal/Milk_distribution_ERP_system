import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { DeliverySession } from '../../../../../generated/prisma/client.js';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  vehicle_id?: number | null;

  @IsOptional()
  @IsEnum(DeliverySession)
  delivery_session?: DeliverySession;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}