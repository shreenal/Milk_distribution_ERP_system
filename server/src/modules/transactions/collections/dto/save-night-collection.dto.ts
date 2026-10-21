import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { CollectionAmount } from '../collection-amount.decorator.js';

export class NightCollectionEntryDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId!: number;

  @CollectionAmount()
  officeCashCollection?: number | null;
}

export class SaveNightCollectionsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => NightCollectionEntryDto)
  entries!: NightCollectionEntryDto[];

  // CD-9.1: required. Only an explicit null skips validation (no @IsOptional()).
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
