// trays/dto/save-trays-entries.dto.ts
import { IsInt, Min } from 'class-validator';

export class SaveTrayReturnDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsInt()
  @Min(1)
  trayTypeId!: number;

  @IsInt()
  @Min(0)
  returned!: number;     // ✓ ONLY operator-entered field
}