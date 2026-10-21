import {
  IsArray,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
  IsInt,
  ArrayMinSize,
} from 'class-validator';
import { QUANTITY_PRECISION } from '../orders.constants.js';
import { Transform, Type } from 'class-transformer';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

export class SaveNightEntriesDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId!: number;

  // null / blank / omitted = "no entry" (cell untouched). Explicit 0 is a real value.
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(QUANTITY_PRECISION.MAX_ORDERED_QTY)
  orderedQty?: number | null;
}

/** An entry that carries an explicitly supplied quantity (the only kind that is processed). */
export type ExplicitNightEntry = SaveNightEntriesDto & { orderedQty: number };

export class SaveNightEntriesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SaveNightEntriesDto)
  entries!: SaveNightEntriesDto[];

  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
