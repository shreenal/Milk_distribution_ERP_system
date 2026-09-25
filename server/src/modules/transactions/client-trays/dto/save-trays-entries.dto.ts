// trays/dto/save-trays-entries.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveTrayReturnDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsInt()
  @Min(1)
  trayTypeId!: number;

  @IsInt()
  @Min(0)
  returned!: number; // ✓ ONLY operator-entered field
}

export class SaveTrayEntriesRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveTrayReturnDto)
  entries!: SaveTrayReturnDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
