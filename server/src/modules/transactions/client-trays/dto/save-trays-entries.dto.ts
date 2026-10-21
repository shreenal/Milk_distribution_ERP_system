// trays/dto/save-trays-entries.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SupplyCategory } from '../../../../generated/prisma/browser.js';
import { MAX_RETURNED_TRAYS } from '../client-trays.constants.js';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

export class SaveTrayReturnDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsInt()
  @Min(1)
  trayTypeId!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @IsInt()
  @Min(0)
  @Max(MAX_RETURNED_TRAYS)
  returned!: number; // ✓ ONLY operator-entered field
}

export class SaveTrayEntriesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SaveTrayReturnDto)
  entries!: SaveTrayReturnDto[];

  // Decision 15: mandatory. Only an explicit null is allowed, and only for
  // the first save of a sheet whose token is still empty (same contract as
  // Orders, OD-12.7). Omitted = 400, stale = 409.
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
