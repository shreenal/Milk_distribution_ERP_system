import { IsEnum, IsInt, Min } from 'class-validator';
import { DeliverySession } from '../../../../generated/prisma/enums.js';

export class SaveDairyTrayEntryDto {
  @IsInt()
  @Min(1)
  vehicleId!: number;

  @IsInt()
  @Min(1)
  trayTypeId!: number;

  @IsInt()
  @Min(0)
  returned!: number;

  @IsEnum(DeliverySession)
  deliverySession!: DeliverySession;
}
