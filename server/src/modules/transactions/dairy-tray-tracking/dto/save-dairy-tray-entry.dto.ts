import { Type } from 'class-transformer';
import { IsInt, Min, ValidateNested } from 'class-validator';

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
}
