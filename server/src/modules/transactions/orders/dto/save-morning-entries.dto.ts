import {
  IsNumber,
  Min,
  Max,
  IsArray,
  IsOptional,
  ValidateNested,
  ArrayMaxSize,
  IsInt,
  ArrayMinSize,
} from 'class-validator';
import { QUANTITY_PRECISION } from '../orders.constants.js';
import { Transform, Type } from 'class-transformer';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

export class SaveMorningEntriesDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId!: number;

  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(QUANTITY_PRECISION.MAX_DELIVERED_QTY)
  deliveredQty?: number | null;
}

export type ExplicitMorningEntry = SaveMorningEntriesDto & {
  deliveredQty: number;
};

export class SaveMorningEntriesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SaveMorningEntriesDto)
  entries!: SaveMorningEntriesDto[];

  // OD-12.7: required. Only an explicit null skips validation (no @IsOptional()).
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
