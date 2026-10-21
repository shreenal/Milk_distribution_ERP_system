import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';

import { DeliverySession } from '../../../../../generated/prisma/client.js';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateGroupDto {
  @TrimmedName(100)
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
