import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { QUANTITY_PRECISION } from '../orders.constants.js';
import { Type } from 'class-transformer';

export class SaveNightEntriesDto {
  @IsNumber()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(1)
  productId!: number;

  @IsNumber()
  @Min(0)
  @Max(QUANTITY_PRECISION.MAX_ORDERED_QTY)
  orderedQty!: number;
}

export class SaveNightEntriesRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveNightEntriesDto)
  entries!: SaveNightEntriesDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
