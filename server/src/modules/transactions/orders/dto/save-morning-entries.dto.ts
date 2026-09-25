import {
  IsNumber,
  Min,
  Max,
  IsArray,
  IsISO8601,
  IsOptional,
  ValidateNested,
} from 'class-validator';
// save-night-entries.dto.ts / save-morning-entries.dto.ts
import { QUANTITY_PRECISION } from '../orders.constants.js';
import { Type } from 'class-transformer';

export class SaveMorningEntriesDto {
  @IsNumber()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(1)
  productId!: number;

  @IsNumber()
  @Min(0)
  @Max(QUANTITY_PRECISION.MAX_DELIVERED_QTY)
  deliveredQty!: number;
}

export class SaveMorningEntriesRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveMorningEntriesDto)
  entries!: SaveMorningEntriesDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
