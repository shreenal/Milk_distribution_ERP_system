import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { DeliverySession } from '../../../../generated/prisma/client.js';
import { MAX_RETURNED_TRAYS } from '../dairy-trays.constants.js';

export class SaveDairyTrayEntryDto {
  // Ids are bounded so an oversized id is a 400, never a database overflow.
  @IsInt()
  @Min(1)
  @Max(2147483647)
  vehicleId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  trayTypeId!: number;

  @IsEnum(DeliverySession)
  deliverySession!: DeliverySession;

  // DT-4.1: whole number 0..2000. Null, blank and omitted are rejected.
  @IsInt()
  @Min(0)
  @Max(MAX_RETURNED_TRAYS)
  returned!: number;
}
